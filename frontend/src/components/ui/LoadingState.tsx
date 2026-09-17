import React from 'react';
import { ZorvexLoadingScreen } from './ZorvexLoadingScreen';

export const LoadingState: React.FC<{ message?: string; fullScreen?: boolean }> = ({ 
    message,
    fullScreen = false 
}) => {
    return (
        <ZorvexLoadingScreen 
            message={message} 
            fullScreen={fullScreen} 
            variant="auto"
        />
    );
};
