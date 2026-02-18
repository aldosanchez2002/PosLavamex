import React from 'react';

const Modal = ({ title, onClose, children, icon: Icon, footer }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="font-bold mb-4 text-lg text-gray-800 flex items-center">
                {Icon && <Icon className="mr-2" />} {title}
            </h3>
            <div className="mb-6">{children}</div>
            {footer ? footer : (
                <button onClick={onClose} className="w-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 p-3 rounded-xl font-bold">Cerrar</button>
            )}
        </div>
    </div>
);

export default Modal;
