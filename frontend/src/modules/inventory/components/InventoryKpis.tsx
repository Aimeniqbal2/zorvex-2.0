import React, { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { getInventoryKpis } from '../api';
import type { InventoryKpis as InventoryKpisType } from '../types';
import { useToastStore } from '../../../stores/toastStore';

export const InventoryKpis: React.FC = () => {
    const [kpis, setKpis] = useState<InventoryKpisType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { error } = useToastStore();

    useEffect(() => {
        let isMounted = true;
        const fetchKpis = async () => {
            try {
                const data = await getInventoryKpis();
                if (isMounted) setKpis(data);
            } catch (err) {
                if (isMounted) {
                    error('Failed to load inventory KPIs');
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchKpis();

        return () => { isMounted = false; };
    }, [error]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            maximumFractionDigits: 0
        }).format(value);
    };

    if (isLoading) {
        return (
            <div className="inventory-kpis">
                <Card className="kpi-card">
                    <div className="kpi-value"><i className='bx bx-loader-alt bx-spin'></i></div>
                    <div className="kpi-label">Active SKUs</div>
                </Card>
                <Card className="kpi-card">
                    <div className="kpi-value"><i className='bx bx-loader-alt bx-spin'></i></div>
                    <div className="kpi-label">Asset Value</div>
                </Card>
                <Card className="kpi-card">
                    <div className="kpi-value"><i className='bx bx-loader-alt bx-spin'></i></div>
                    <div className="kpi-label">Low Stock</div>
                </Card>
            </div>
        );
    }

    return (
        <div className="inventory-kpis">
            <Card className="kpi-card">
                <div className="kpi-value">{kpis?.total_active_skus?.toLocaleString() || '0'}</div>
                <div className="kpi-label">Active SKUs</div>
            </Card>
            <Card className="kpi-card">
                <div className="kpi-value">{kpis ? formatCurrency(kpis.calculated_asset_value) : 'PKR 0'}</div>
                <div className="kpi-label">Asset Value</div>
            </Card>
            <Card className="kpi-card">
                <div className="kpi-value">{kpis?.hardware_shortages?.toLocaleString() || '0'}</div>
                <div className="kpi-label">Low Stock</div>
            </Card>
        </div>
    );
};
