"""
CarWash Camera Monitor
======================
Single-file solution. Watches 2 cameras / 5 washer slots.
Detects vehicle arrivals via slot occupancy, describes them with Claude Vision,
and alerts Firestore if no matching PENDING ticket exists.

Files needed to run:
    monitor.py              ← this file
    .env                    ← your credentials/config
    serviceAccountKey.json  ← downloaded from Firebase
    zones.json              ← created by running:  python monitor.py --setup

Usage:
    python monitor.py --setup     # draw slot zones once
    python monitor.py             # run the monitor
"""

import os, sys, cv2, time, json, queue, base64, logging, threading, argparse
import anthropic, firebase_admin
import numpy as np
from datetime import datetime, timezone, timedelta
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

CAMERAS = [
    {"id": "cam1", "rtsp": os.getenv("RTSP_CAM1")},
    {"id": "cam2", "rtsp": os.getenv("RTSP_CAM2")},
]
# Which slots belong to which camera (must match what you draw in --setup)
CAMERA_SLOTS = {
    "cam1": ["Slot 1", "Slot 2", "Slot 3"],
    "cam2": ["Slot 4", "Slot 5"],
}

ZONES_FILE            = os.getenv("ZONES_FILE",            "zones.json")
FIREBASE_CRED         = os.getenv("FIREBASE_CRED_PATH",    "serviceAccountKey.json")
ANTHROPIC_API_KEY     = os.getenv("ANTHROPIC_API_KEY")
TICKET_WINDOW_MINUTES = int(os.getenv("TICKET_WINDOW_MINUTES", "10"))

# Occupancy tuning
OCCUPANCY_RATIO        = 0.25   # fraction of zone pixels that must differ → "occupied"
PIXEL_DIFF_THRESH      = 40     # per-pixel brightness diff to count as changed
OCCUPANCY_HOLD_SECONDS = 8      # car must stay this long before triggering
EMPTY_HOLD_SECONDS     = 5      # slot must stay clear this long before resetting
FRAME_INTERVAL         = 1.0    # seconds between occupancy checks
RECONNECT_DELAY        = 5      # seconds before retrying a dropped stream

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("monitor.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE SETUP TOOL  (python monitor.py --setup)
# ═══════════════════════════════════════════════════════════════════════════════

_drawing  = False
_start_pt = (0, 0)
_end_pt   = (0, 0)

def _mouse_cb(event, x, y, flags, param):
    global _drawing, _start_pt, _end_pt
    if   event == cv2.EVENT_LBUTTONDOWN: _drawing = True;  _start_pt = _end_pt = (x, y)
    elif event == cv2.EVENT_MOUSEMOVE and _drawing:         _end_pt   = (x, y)
    elif event == cv2.EVENT_LBUTTONUP:   _drawing = False; _end_pt   = (x, y)

def _grab_frame(rtsp_url: str):
    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    for _ in range(5): cap.grab()
    ret, frame = cap.retrieve()
    cap.release()
    if not ret: raise RuntimeError(f"Could not read frame from {rtsp_url}")
    return frame

def _draw_overlay(frame, zones, current=None):
    out = frame.copy()
    colors = [(0,200,255),(0,255,100),(255,100,0),(200,0,255),(255,200,0)]
    for i, (x1,y1,x2,y2,label) in enumerate(zones):
        c = colors[i % len(colors)]
        cv2.rectangle(out, (x1,y1), (x2,y2), c, 2)
        cv2.putText(out, label, (x1+4, y1+22), cv2.FONT_HERSHEY_SIMPLEX, 0.65, c, 2)
    if current:
        x1,y1,x2,y2 = current
        cv2.rectangle(out, (x1,y1), (x2,y2), (255,255,255), 1)
    return out

def run_setup():
    """Interactive zone drawing tool. Run once with --setup flag."""
    global _drawing, _start_pt, _end_pt
    print("\n── Zone Setup ─────────────────────────────────────────────────────")
    print("  For each camera: drag rectangles over washer slots.")
    print("  ENTER = confirm zone   ESC = undo last   S = save & next camera\n")

    all_zones = []

    for cam in CAMERAS:
        if not cam["rtsp"]:
            print(f"  ⚠  Skipping {cam['id']} — RTSP URL not set in .env")
            continue

        slot_names = CAMERA_SLOTS[cam["id"]]
        confirmed  = []
        _start_pt  = _end_pt = (0, 0)
        _drawing   = False

        frame = _grab_frame(cam["rtsp"])
        win   = f"Setup: {cam['id']} — draw {len(slot_names)} slot(s), then press S"
        cv2.namedWindow(win)
        cv2.setMouseCallback(win, _mouse_cb)

        slot_idx = 0
        while True:
            current = (_start_pt[0], _start_pt[1], _end_pt[0], _end_pt[1]) if _drawing else None
            disp    = _draw_overlay(frame, confirmed, current)
            remaining = slot_names[slot_idx:] if slot_idx < len(slot_names) else []
            hint = f"Draw: {remaining[0]}" if remaining else "All slots done — press S to save"
            cv2.putText(disp, hint, (10, disp.shape[0]-15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)
            cv2.imshow(win, disp)
            key = cv2.waitKey(30) & 0xFF

            if key == 13 and not _drawing and _start_pt != _end_pt and slot_idx < len(slot_names):
                x1,y1 = min(_start_pt[0],_end_pt[0]), min(_start_pt[1],_end_pt[1])
                x2,y2 = max(_start_pt[0],_end_pt[0]), max(_start_pt[1],_end_pt[1])
                label = slot_names[slot_idx]
                confirmed.append((x1,y1,x2,y2,label))
                slot_idx += 1
                _start_pt = _end_pt = (0,0)
                print(f"  ✓ {label}: ({x1},{y1}) → ({x2},{y2})")
            elif key == 27 and confirmed:
                removed = confirmed.pop(); slot_idx = max(0, slot_idx-1)
                print(f"  ✗ Removed: {removed[4]}")
            elif key == ord("s"):
                cv2.destroyWindow(win); break
            elif key == ord("q"):
                cv2.destroyAllWindows(); raise SystemExit("Setup cancelled.")

        all_zones.extend([
            {"camera_id": cam["id"], "label": lbl,
             "x1": x1, "y1": y1, "x2": x2, "y2": y2}
            for x1,y1,x2,y2,lbl in confirmed
        ])

    with open(ZONES_FILE, "w") as f:
        json.dump(all_zones, f, indent=2)
    print(f"\n✅ Saved {len(all_zones)} zone(s) to {ZONES_FILE}")
    print("Run without --setup to start monitoring.\n")

# ═══════════════════════════════════════════════════════════════════════════════
#  SLOT OCCUPANCY DETECTOR
# ═══════════════════════════════════════════════════════════════════════════════

class SlotDetector:
    """
    Tracks one washer slot zone through states:
        EMPTY → FILLING → OCCUPIED → EMPTYING → EMPTY

    Emits 'ARRIVED' when a vehicle is confirmed in the slot.
    Emits 'DEPARTED' when the slot clears.
    """
    def __init__(self, zone: dict):
        self.zone_id   = zone["label"]
        self.camera_id = zone["camera_id"]
        self.x1, self.y1, self.x2, self.y2 = zone["x1"], zone["y1"], zone["x2"], zone["y2"]
        self.state       = "EMPTY"
        self.state_since = time.time()
        self.background  = None

    def _crop(self, frame):
        return frame[self.y1:self.y2, self.x1:self.x2]

    def _occupancy(self, gray) -> float:
        if self.background is None: return 0.0
        diff = cv2.absdiff(gray, self.background)
        return float(np.sum(diff > PIXEL_DIFF_THRESH)) / max(diff.size, 1)

    def _to_gray(self, frame):
        g = cv2.cvtColor(self._crop(frame), cv2.COLOR_BGR2GRAY)
        return cv2.GaussianBlur(g, (15,15), 0)

    def learn_background(self, frame):
        self.background = self._to_gray(frame)

    def update(self, frame) -> str | None:
        gray = self._to_gray(frame)
        if self.background is None:
            self.background = gray; return None

        occupied = self._occupancy(gray) >= OCCUPANCY_RATIO
        now      = time.time()

        if self.state == "EMPTY":
            if occupied:
                self.state = "FILLING"; self.state_since = now

        elif self.state == "FILLING":
            if not occupied:
                self.state = "EMPTY"; self.state_since = now
            elif (now - self.state_since) >= OCCUPANCY_HOLD_SECONDS:
                self.state = "OCCUPIED"; self.state_since = now
                return "ARRIVED"

        elif self.state == "OCCUPIED":
            if not occupied:
                self.state = "EMPTYING"; self.state_since = now

        elif self.state == "EMPTYING":
            if occupied:
                self.state = "OCCUPIED"; self.state_since = now
            elif (now - self.state_since) >= EMPTY_HOLD_SECONDS:
                self.background = gray   # update background to current empty state
                self.state = "EMPTY"; self.state_since = now
                return "DEPARTED"

        return None

# ═══════════════════════════════════════════════════════════════════════════════
#  CAMERA WORKER THREAD
# ═══════════════════════════════════════════════════════════════════════════════

class CameraWorker(threading.Thread):
    def __init__(self, cam: dict, zones: list, event_queue: queue.Queue):
        super().__init__(daemon=True, name=f"cam-{cam['id']}")
        self.cam_id      = cam["id"]
        self.rtsp        = cam["rtsp"]
        self.event_queue = event_queue
        self.detectors   = [SlotDetector(z) for z in zones if z["camera_id"] == cam["id"]]
        log.info(f"[{self.cam_id}] Worker ready: {[d.zone_id for d in self.detectors]}")

    def _open(self):
        cap = cv2.VideoCapture(self.rtsp, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened(): raise RuntimeError(f"Cannot open {self.rtsp}")
        return cap

    def _latest(self, cap):
        cap.grab()
        ret, frame = cap.retrieve()
        return frame if ret else None

    def run(self):
        while True:
            try:
                cap         = self._open()
                log.info(f"[{self.cam_id}] Stream opened.")
                booted      = False
                while True:
                    frame = self._latest(cap)
                    if frame is None:
                        log.warning(f"[{self.cam_id}] Lost feed — reconnecting..."); break
                    if not booted:
                        for d in self.detectors: d.learn_background(frame)
                        log.info(f"[{self.cam_id}] Background learned.")
                        booted = True
                    for d in self.detectors:
                        event = d.update(frame)
                        if event:
                            self.event_queue.put({
                                "event": event, "camera_id": self.cam_id,
                                "slot": d.zone_id, "frame": frame.copy() if event == "ARRIVED" else None
                            })
                    time.sleep(FRAME_INTERVAL)
                cap.release()
            except Exception as e:
                log.error(f"[{self.cam_id}] Error: {e}")
            time.sleep(RECONNECT_DELAY)

# ═══════════════════════════════════════════════════════════════════════════════
#  CLAUDE VISION
# ═══════════════════════════════════════════════════════════════════════════════

VISION_PROMPT = """
You are a vehicle identification assistant for a car wash entry camera in Mexico.
Return ONLY a valid JSON object — no explanation, no markdown.

{
  "has_vehicle": true or false,
  "color": "primary color in Spanish, capitalized (Rojo, Azul, Blanco, Negro, Gris, Plata, Verde, Amarillo, Naranja, Cafe, Morado)",
  "vehicle_class": "Auto | Camioneta | Van | Pickup | Moto | Otro",
  "size": "AUTO for cars/sedans/coupes/hatchbacks — CAMIONETA for trucks/SUVs/vans/pickups",
  "description": "3-6 word Spanish description a greeter would type, e.g. 'Auto rojo sedan compacto'"
}

If no vehicle is clearly visible, return has_vehicle: false and empty strings for the rest.
""".strip()

def describe_vehicle(client: anthropic.Anthropic, frame) -> dict | None:
    _, buf    = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    image_b64 = base64.b64encode(buf).decode("utf-8")
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
                {"type": "text",  "text": VISION_PROMPT},
            ]}],
        )
        raw = resp.content[0].text.strip().replace("```json","").replace("```","").strip()
        return json.loads(raw)
    except Exception as e:
        log.error(f"Claude error: {e}"); return None

# ═══════════════════════════════════════════════════════════════════════════════
#  FIRESTORE
# ═══════════════════════════════════════════════════════════════════════════════

def get_pending_tickets(db, minutes: int) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    try:
        docs = (db.collection("tickets")
                  .where("status", "==", "PENDING")
                  .where("timestamp", ">=", cutoff)
                  .order_by("timestamp", direction=firestore.Query.DESCENDING)
                  .stream())
        tickets = []
        for doc in docs:
            d = doc.to_dict(); d["_id"] = doc.id; tickets.append(d)
        return tickets
    except Exception as e:
        log.error(f"Firestore query error: {e}"); return []

def match_ticket(vehicle: dict, tickets: list[dict]) -> tuple[dict | None, str]:
    color = vehicle.get("color","").lower().strip()
    size  = vehicle.get("size","").upper()
    strong = weak = None
    for t in tickets:
        desc    = t.get("vehicleDesc","").lower()
        t_size  = (t.get("size") or {})
        t_size  = t_size.get("id","").upper() if isinstance(t_size, dict) else str(t_size).upper()
        c_hit   = color and color in desc
        s_hit   = size == t_size
        if c_hit and s_hit: strong = t; break
        elif c_hit and not weak: weak = t
    if strong: return strong, "STRONG"
    if weak:   return weak,   "WEAK"
    return None, "NONE"

def write_alert(db, vehicle: dict, slot: str, camera_id: str):
    try:
        db.collection("camera_alerts").add({
            "type":               "UNREGISTERED_VEHICLE",
            "timestamp":          firestore.SERVER_TIMESTAMP,
            "cameraId":           camera_id,
            "slotLabel":          slot,
            "vehicleDescription": vehicle.get("description",""),
            "color":              vehicle.get("color",""),
            "vehicleClass":       vehicle.get("vehicle_class",""),
            "size":               vehicle.get("size",""),
            "reviewed":           False,
        })
        log.info(f"🚨 Alert written → {vehicle.get('description')} in {slot}")
    except Exception as e:
        log.error(f"Failed to write alert: {e}")

def write_match_log(db, vehicle: dict, ticket: dict, tier: str, slot: str, camera_id: str):
    try:
        db.collection("camera_logs").add({
            "type":              "VEHICLE_MATCHED",
            "timestamp":         firestore.SERVER_TIMESTAMP,
            "cameraId":          camera_id,
            "slotLabel":         slot,
            "ticketId":          ticket["_id"],
            "ticketDesc":        ticket.get("vehicleDesc",""),
            "detectedDesc":      vehicle.get("description",""),
            "matchTier":         tier,
        })
    except Exception as e:
        log.error(f"Failed to write match log: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN MONITOR
# ═══════════════════════════════════════════════════════════════════════════════

def validate():
    errors = []
    if not os.path.exists(ZONES_FILE):    errors.append("zones.json missing — run: python monitor.py --setup")
    if not os.path.exists(FIREBASE_CRED): errors.append(f"Firebase key not found: {FIREBASE_CRED}")
    if not ANTHROPIC_API_KEY:             errors.append("ANTHROPIC_API_KEY not set in .env")
    for cam in CAMERAS:
        if not cam["rtsp"]:               errors.append(f"{cam['id']} RTSP URL not set in .env")
    if errors:
        for e in errors: log.error(f"CONFIG: {e}")
        raise SystemExit("Fix the above and restart.")

def handle_arrived(event, db, claude):
    slot, cam_id, frame = event["slot"], event["camera_id"], event["frame"]
    log.info(f"▶ Vehicle arrived — {slot} ({cam_id})")

    vehicle = describe_vehicle(claude, frame)
    if not vehicle or not vehicle.get("has_vehicle"):
        log.warning(f"  Claude saw no vehicle in {slot} — skipping."); return

    log.info(f"  Detected: {vehicle.get('description')}")

    tickets           = get_pending_tickets(db, TICKET_WINDOW_MINUTES)
    matched, tier     = match_ticket(vehicle, tickets)

    if tier == "STRONG":
        log.info(f"  ✅ STRONG match → Ticket {matched['_id']} ({matched.get('vehicleDesc','')})")
        write_match_log(db, vehicle, matched, tier, slot, cam_id)
    elif tier == "WEAK":
        log.warning(f"  ⚠  WEAK match → Ticket {matched['_id']} (color ok, size differs) — alerting")
        write_alert(db, vehicle, slot, cam_id)
        write_match_log(db, vehicle, matched, tier, slot, cam_id)
    else:
        log.warning(f"  🚨 NO MATCH — no PENDING ticket for: {vehicle.get('description')}")
        write_alert(db, vehicle, slot, cam_id)

def run_monitor():
    log.info("=" * 55)
    log.info("  CarWash Camera Monitor — Starting")
    log.info("=" * 55)
    validate()

    with open(ZONES_FILE) as f:
        zones = json.load(f)
    log.info(f"Loaded {len(zones)} zone(s)")

    cred = credentials.Certificate(FIREBASE_CRED)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    log.info("Firebase connected.")

    claude       = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    event_queue  = queue.Queue()

    for cam in CAMERAS:
        cam_zones = [z for z in zones if z["camera_id"] == cam["id"]]
        if not cam_zones:
            log.warning(f"No zones for {cam['id']} — skipping."); continue
        CameraWorker(cam, cam_zones, event_queue).start()

    log.info("Monitoring all slots...\n")

    while True:
        try:
            event = event_queue.get(timeout=1.0)
            if   event["event"] == "ARRIVED":  handle_arrived(event, db, claude)
            elif event["event"] == "DEPARTED": log.info(f"◀ Slot cleared — {event['slot']}")
        except queue.Empty:
            pass
        except KeyboardInterrupt:
            log.info("Stopped."); break
        except Exception as e:
            log.error(f"Event handler error: {e}", exc_info=True)

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CarWash Camera Monitor")
    parser.add_argument("--setup", action="store_true", help="Draw slot zones interactively")
    args = parser.parse_args()

    if args.setup:
        run_setup()
    else:
        run_monitor()