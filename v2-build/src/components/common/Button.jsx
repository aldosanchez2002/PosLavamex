import React from 'react';

const Button = ({ onClick, children, variant = 'primary', className = '', ...props }) => {
    const base = "p-3 rounded-xl font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-2";
    const styles = {
        primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300",
        danger: "bg-red-100 text-red-700 border border-red-200 hover:bg-red-200",
        secondary: "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50",
        success: "bg-green-600 text-white hover:bg-green-700",
        warning: "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200",
        ghost: "bg-transparent text-gray-500 hover:bg-gray-100",
        blueLight: "bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200",
        orangeLight: "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200"
    };
    const variantStyle = styles[variant] || styles.primary;
    return <button onClick={onClick} className={`${base} ${variantStyle} ${className}`} {...props}>{children}</button>;
};

export default Button;
