import React from 'react';
import { Card } from '../../../components/ui/Card';

export const PayrollDisbursementList: React.FC = () => {
    return (
        <Card title="Payroll Disbursements">
            <div className="p-4">
                <p className="text-gray-500">
                    Process and track bank payments for finalized payroll runs.
                </p>
            </div>
        </Card>
    );
};
