import React from 'react';
import { Card } from '../../../components/ui/Card';

export const StatutorySchemeList: React.FC = () => {
    return (
        <Card title="Statutory Rules & Configurations">
            <div className="p-4">
                <p className="text-gray-500">
                    Configuration for EOBI, Social Security, and Tax schemes.
                </p>
            </div>
        </Card>
    );
};
