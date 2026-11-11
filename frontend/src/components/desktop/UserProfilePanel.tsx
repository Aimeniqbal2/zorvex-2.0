import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../auth/authStore';
import { TokenManager } from '../../auth/tokenManager';
import { useToastStore } from '../../stores/toastStore';
import { API_HOST_URL } from '../../api/client';
import {
    fetchMyProfile,
    verifyMyCurrentPassword,
    changeMyPassword,
    extractAuthApiError,
    type UserFullProfile,
} from '../../api/account';

function formatDateTimeDisplay(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateOnlyDisplay(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

function resolveMediaUrl(raw?: string | null): string | null {
    if (!raw) return null;
    if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    return `${API_HOST_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

interface ReadOnlyFieldProps {
    label: string;
    value?: string | number | null;
    mono?: boolean;
    capitalize?: boolean;
}

const ReadOnlyField: React.FC<ReadOnlyFieldProps> = ({ label, value, mono = false, capitalize = false }) => (
    <div>
        <div
            style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-muted)',
                fontWeight: 600,
                marginBottom: '4px',
            }}
        >
            {label}
        </div>
        <div
            style={{
                padding: '9px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                background: 'var(--color-surface-secondary)',
                color: 'var(--color-text)',
                fontSize: '13px',
                fontFamily: mono ? 'monospace' : 'inherit',
                textTransform: capitalize ? 'capitalize' : 'none',
                wordBreak: 'break-word',
                userSelect: 'text',
            }}
        >
            {value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : 'Not Assigned'}
        </div>
    </div>
);

export const UserProfilePanel: React.FC = () => {
    const { user, setAuth } = useAuthStore();
    const [profile, setProfile] = useState<UserFullProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
    const [profileError, setProfileError] = useState<string | null>(null);

    // Step 1 & Step 2 Authenticated Password Change State
    const [oldPassword, setOldPassword] = useState<string>('');
    const [verifiedOldPassword, setVerifiedOldPassword] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');

    const [showOldPw, setShowOldPw] = useState<boolean>(false);
    const [showNewPw, setShowNewPw] = useState<boolean>(false);
    const [showConfirmPw, setShowConfirmPw] = useState<boolean>(false);

    const [verifying, setVerifying] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [pwError, setPwError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [pwSuccess, setPwSuccess] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoadingProfile(true);
            setProfileError(null);
            try {
                const data = await fetchMyProfile();
                if (mounted) setProfile(data);
            } catch (err: any) {
                if (mounted) {
                    setProfileError(
                        err?.response?.data?.detail ||
                            err?.response?.data?.error ||
                            'Unable to refresh full profile details from server.'
                    );
                }
            } finally {
                if (mounted) setLoadingProfile(false);
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, []);

    const displayName = profile?.full_name || user?.full_name || user?.username || 'User';
    const displayUsername = profile?.username || user?.username || '—';
    const displayEmail = profile?.email || user?.email || 'Not Provided';
    const displayRole = profile?.role_display || (user?.role ? user.role.replace(/_/g, ' ') : 'Staff');
    const companyName = profile?.company_name || user?.company_name || 'Zorvex ERP';
    const businessType = profile?.business_type || user?.business_type || 'General';
    const emp = profile?.employee_profile || null;
    const avatarSrc =
        resolveMediaUrl(emp?.photograph_url) ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4318ff&color=fff&rounded=true&size=96`;

    const handleVerifyOldPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(null);
        setFieldErrors({});

        if (!oldPassword) {
            setPwError('Please enter your current (old) password first.');
            setFieldErrors({ old_password: 'Current password is required.' });
            return;
        }

        setVerifying(true);
        try {
            await verifyMyCurrentPassword(oldPassword);
            setVerifiedOldPassword(oldPassword);
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            const parsed = extractAuthApiError(err, 'Current password is incorrect.');
            setPwError(parsed.message);
            setFieldErrors(parsed.fieldErrors);
            setVerifiedOldPassword(null);
        } finally {
            setVerifying(false);
        }
    };

    const handleResetPasswordStep = () => {
        setVerifiedOldPassword(null);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPwError(null);
        setFieldErrors({});
    };

    const handleSubmitNewPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(null);
        setFieldErrors({});

        const activeOldPw = verifiedOldPassword ?? oldPassword;
        if (!activeOldPw) {
            setPwError('Please verify your current password first.');
            setVerifiedOldPassword(null);
            return;
        }
        if (newPassword.length < 8) {
            const msg = 'New password must be at least 8 characters long.';
            setPwError(msg);
            setFieldErrors({ new_password: msg });
            return;
        }
        if (/^\d+$/.test(newPassword)) {
            const msg = 'New password cannot be entirely numeric.';
            setPwError(msg);
            setFieldErrors({ new_password: msg });
            return;
        }
        if (newPassword === activeOldPw) {
            const msg = 'New password must be different from your current password.';
            setPwError(msg);
            setFieldErrors({ new_password: msg });
            return;
        }
        if (newPassword !== confirmPassword) {
            const msg = 'New password and confirm password do not match.';
            setPwError(msg);
            setFieldErrors({ confirm_password: msg });
            return;
        }

        setSubmitting(true);
        try {
            const res = await changeMyPassword({
                old_password: activeOldPw,
                new_password: newPassword,
                confirm_password: confirmPassword,
            });

            if (res.access && res.refresh) {
                TokenManager.setTokens(res.access, res.refresh);
                setAuth(res.access);
            }

            // Keep saved "Remember Me" credentials synchronized so next login works seamlessly
            if (typeof window !== 'undefined' && localStorage.getItem('remembered_password') !== null) {
                const remUser = (localStorage.getItem('remembered_username') || '').trim().toLowerCase();
                if (remUser === displayUsername.toLowerCase() || remUser === displayEmail.toLowerCase()) {
                    localStorage.setItem('remembered_password', newPassword);
                }
            }

            setOldPassword('');
            setVerifiedOldPassword(null);
            setNewPassword('');
            setConfirmPassword('');
            setShowOldPw(false);
            setShowNewPw(false);
            setShowConfirmPw(false);
            const okMsg = res.message || 'Your password has been changed successfully.';
            setPwSuccess(okMsg);
            useToastStore.getState().success(okMsg);
        } catch (err: any) {
            const parsed = extractAuthApiError(err, 'Failed to update password. Please check your entries.');
            setPwError(parsed.message);
            setFieldErrors(parsed.fieldErrors);
            if (parsed.fieldErrors.old_password) {
                setVerifiedOldPassword(null);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const passwordInputWrapStyle: React.CSSProperties = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    };

    const passwordInputStyle = (hasErr?: boolean): React.CSSProperties => ({
        width: '100%',
        padding: '9px 38px 9px 12px',
        borderRadius: '8px',
        border: `1px solid ${hasErr ? '#ef4444' : 'var(--color-border)'}`,
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        fontSize: '13.5px',
        boxSizing: 'border-box',
    });

    const eyeBtnStyle: React.CSSProperties = {
        position: 'absolute',
        right: '8px',
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '17px',
    };

    const minLengthOk = newPassword.length >= 8;
    const notAllNumericOk = newPassword.length > 0 && !/^\d+$/.test(newPassword);
    const differentFromOldOk =
        newPassword.length > 0 && verifiedOldPassword !== null && newPassword !== verifiedOldPassword;
    const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Identity Banner (Read Only) */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    padding: '16px 18px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-secondary)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                        src={avatarSrc}
                        alt={displayName}
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid var(--color-border)',
                            background: '#ffffff',
                        }}
                    />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text)' }}>
                                {displayName}
                            </h3>
                            <span
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    background: 'rgba(34, 197, 94, 0.14)',
                                    color: '#16a34a',
                                    border: '1px solid rgba(34, 197, 94, 0.25)',
                                }}
                            >
                                {profile ? (profile.is_active ? 'Active Account' : 'Inactive') : 'Authenticated'}
                            </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                            @{displayUsername} • {displayRole} • {companyName}
                        </div>
                    </div>
                </div>

                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-muted)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                    }}
                    title="Profile identity, role, and company details are view-only and managed by your administrator."
                >
                    <i className='bx bx-lock-alt' style={{ fontSize: '14px' }}></i>
                    Read-Only Profile
                </span>
            </div>

            {profileError && (
                <div
                    style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid rgba(234, 179, 8, 0.35)',
                        color: '#b45309',
                        fontSize: '12.5px',
                    }}
                >
                    {profileError}
                </div>
            )}

            {/* Section 1: Change Password (Authenticated with Current Password) */}
            <div
                style={{
                    padding: '18px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        marginBottom: '12px',
                        flexWrap: 'wrap',
                    }}
                >
                    <div>
                        <h4
                            style={{
                                margin: 0,
                                fontSize: '15px',
                                fontWeight: 700,
                                color: 'var(--color-text)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                            }}
                        >
                            <i className='bx bx-shield-quarter' style={{ color: 'var(--color-primary)', fontSize: '18px' }}></i>
                            Change Password
                        </h4>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Enter and verify your current (old) password first before setting a new password.
                        </p>
                    </div>

                    {verifiedOldPassword !== null && (
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 10px',
                                borderRadius: '9999px',
                                background: 'rgba(34, 197, 94, 0.14)',
                                color: '#16a34a',
                                fontSize: '11.5px',
                                fontWeight: 700,
                            }}
                        >
                            <i className='bx bx-check-circle'></i>
                            Old Password Verified
                        </span>
                    )}
                </div>

                {pwSuccess && (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: 'rgba(34, 197, 94, 0.12)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            color: '#15803d',
                            fontSize: '13px',
                            fontWeight: 600,
                            marginBottom: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <i className='bx bx-check-shield' style={{ fontSize: '18px' }}></i>
                        <span>{pwSuccess}</span>
                    </div>
                )}

                {pwError && (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: 500,
                            marginBottom: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <i className='bx bx-error-circle' style={{ fontSize: '18px' }}></i>
                        <span>{pwError}</span>
                    </div>
                )}

                {verifiedOldPassword === null ? (
                    <form onSubmit={handleVerifyOldPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '440px' }}>
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '11.5px',
                                    textTransform: 'uppercase',
                                    color: 'var(--color-text-muted)',
                                    fontWeight: 600,
                                    marginBottom: '6px',
                                }}
                            >
                                Step 1: Current (Old) Password <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={passwordInputWrapStyle}>
                                <input
                                    type={showOldPw ? 'text' : 'password'}
                                    value={oldPassword}
                                    onChange={(e) => {
                                        setOldPassword(e.target.value);
                                        if (pwError) setPwError(null);
                                        if (pwSuccess) setPwSuccess(null);
                                        if (fieldErrors.old_password) {
                                            setFieldErrors((prev) => ({ ...prev, old_password: '' }));
                                        }
                                    }}
                                    placeholder="Enter your current password to continue"
                                    autoComplete="current-password"
                                    style={passwordInputStyle(Boolean(fieldErrors.old_password))}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOldPw((v) => !v)}
                                    style={eyeBtnStyle}
                                    title={showOldPw ? 'Hide password' : 'Show password'}
                                    aria-label={showOldPw ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`bx ${showOldPw ? 'bx-hide' : 'bx-show'}`}></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <Button type="submit" variant="primary" size="sm" loading={verifying} icon="bx-lock-open-alt">
                                {verifying ? 'Verifying Current Password...' : 'Verify Current Password'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleSubmitNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '460px' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr',
                                gap: '12px',
                            }}
                        >
                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: '11.5px',
                                        textTransform: 'uppercase',
                                        color: 'var(--color-text-muted)',
                                        fontWeight: 600,
                                        marginBottom: '6px',
                                    }}
                                >
                                    Step 2: New Password <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div style={passwordInputWrapStyle}>
                                    <input
                                        type={showNewPw ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => {
                                            setNewPassword(e.target.value);
                                            if (pwError) setPwError(null);
                                            if (fieldErrors.new_password) {
                                                setFieldErrors((prev) => ({ ...prev, new_password: '' }));
                                            }
                                        }}
                                        placeholder="Enter new password (min 8 characters)"
                                        autoComplete="new-password"
                                        style={passwordInputStyle(Boolean(fieldErrors.new_password))}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPw((v) => !v)}
                                        style={eyeBtnStyle}
                                        title={showNewPw ? 'Hide password' : 'Show password'}
                                        aria-label={showNewPw ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`bx ${showNewPw ? 'bx-hide' : 'bx-show'}`}></i>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: '11.5px',
                                        textTransform: 'uppercase',
                                        color: 'var(--color-text-muted)',
                                        fontWeight: 600,
                                        marginBottom: '6px',
                                    }}
                                >
                                    Confirm New Password <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div style={passwordInputWrapStyle}>
                                    <input
                                        type={showConfirmPw ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => {
                                            setConfirmPassword(e.target.value);
                                            if (pwError) setPwError(null);
                                            if (fieldErrors.confirm_password) {
                                                setFieldErrors((prev) => ({ ...prev, confirm_password: '' }));
                                            }
                                        }}
                                        placeholder="Re-enter your new password"
                                        autoComplete="new-password"
                                        style={passwordInputStyle(
                                            Boolean(fieldErrors.confirm_password) ||
                                                (confirmPassword.length > 0 && newPassword !== confirmPassword)
                                        )}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPw((v) => !v)}
                                        style={eyeBtnStyle}
                                        title={showConfirmPw ? 'Hide password' : 'Show password'}
                                        aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`bx ${showConfirmPw ? 'bx-hide' : 'bx-show'}`}></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Live Password Rules Checklist */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                                gap: '6px 12px',
                                fontSize: '11.5px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'var(--color-surface-secondary)',
                                border: '1px solid var(--color-border)',
                            }}
                        >
                            <span style={{ color: minLengthOk ? '#16a34a' : 'var(--color-text-muted)', fontWeight: minLengthOk ? 600 : 400 }}>
                                <i className={`bx ${minLengthOk ? 'bx-check-circle' : 'bx-circle'}`}></i> At least 8 characters
                            </span>
                            <span style={{ color: notAllNumericOk ? '#16a34a' : 'var(--color-text-muted)', fontWeight: notAllNumericOk ? 600 : 400 }}>
                                <i className={`bx ${notAllNumericOk ? 'bx-check-circle' : 'bx-circle'}`}></i> Cannot be numbers only
                            </span>
                            <span style={{ color: differentFromOldOk ? '#16a34a' : 'var(--color-text-muted)', fontWeight: differentFromOldOk ? 600 : 400 }}>
                                <i className={`bx ${differentFromOldOk ? 'bx-check-circle' : 'bx-circle'}`}></i> Different from old password
                            </span>
                            <span style={{ color: passwordsMatch ? '#16a34a' : 'var(--color-text-muted)', fontWeight: passwordsMatch ? 600 : 400 }}>
                                <i className={`bx ${passwordsMatch ? 'bx-check-circle' : 'bx-circle'}`}></i> Confirmation matches
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <Button type="submit" variant="primary" size="sm" loading={submitting} icon="bx-check-shield">
                                {submitting ? 'Updating Password...' : 'Update Password'}
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={handleResetPasswordStep} disabled={submitting}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}
            </div>

            {/* Section 2: Complete Account & Access Info (Strict Read-Only) */}
            <div
                style={{
                    padding: '18px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                        Account & Access Information
                    </h4>
                    {loadingProfile && (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            <i className='bx bx-loader-alt bx-spin'></i> Syncing...
                        </span>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                    <ReadOnlyField label="Full Name" value={displayName} />
                    <ReadOnlyField label="Username" value={displayUsername} />
                    <ReadOnlyField label="Email Address" value={displayEmail} />
                    <ReadOnlyField label="System Role" value={displayRole} capitalize />
                    {profile?.company_role_name && (
                        <ReadOnlyField
                            label="Company Role"
                            value={
                                profile.company_role_code
                                    ? `${profile.company_role_name} (${profile.company_role_code})`
                                    : profile.company_role_name
                            }
                        />
                    )}
                    <ReadOnlyField label="Access Mode" value={profile?.access_mode_display || 'Standard'} />
                    <ReadOnlyField label="User ID" value={profile?.id || user?.user_id} mono />
                    <ReadOnlyField label="Member Since" value={formatDateTimeDisplay(profile?.date_joined)} />
                    <ReadOnlyField label="Last Login" value={formatDateTimeDisplay(profile?.last_login)} />
                </div>

                {profile?.allowed_modules && profile.allowed_modules.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                        <div
                            style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                color: 'var(--color-text-muted)',
                                fontWeight: 600,
                                marginBottom: '6px',
                            }}
                        >
                            Authorized Modules ({profile.allowed_modules.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {profile.allowed_modules.map((modName) => (
                                <span
                                    key={modName}
                                    style={{
                                        fontSize: '11.5px',
                                        padding: '3px 9px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--color-border)',
                                        background: 'var(--color-surface-secondary)',
                                        color: 'var(--color-text)',
                                    }}
                                >
                                    {modName}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Section 3: Organization & Linked Staff Record (Strict Read-Only) */}
            <div
                style={{
                    padding: '18px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                }}
            >
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14.5px', fontWeight: 700, color: 'var(--color-text)' }}>
                    Company & Workforce Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                    <ReadOnlyField label="Company" value={companyName} />
                    <ReadOnlyField label="Industry Profile" value={businessType} capitalize />
                    <ReadOnlyField label="Company ID" value={profile?.company_id || user?.company_id} mono />
                    {profile?.company_phone && <ReadOnlyField label="Company Phone" value={profile.company_phone} />}
                    {profile?.company_tax_id && <ReadOnlyField label="Company NTN / Tax ID" value={profile.company_tax_id} />}
                    {profile?.company_address && <ReadOnlyField label="Company Address" value={profile.company_address} />}

                    {emp && (
                        <>
                            <ReadOnlyField label="Employee Code" value={emp.employee_code} />
                            <ReadOnlyField label="Department" value={emp.department_name} />
                            <ReadOnlyField label="Designation" value={emp.designation_name} />
                            {emp.position_name && <ReadOnlyField label="Position" value={emp.position_name} />}
                            {emp.branch_name && <ReadOnlyField label="Branch" value={emp.branch_name} />}
                            {emp.city && <ReadOnlyField label="Station / City" value={emp.city} />}
                            <ReadOnlyField label="Phone" value={emp.phone} />
                            <ReadOnlyField label="Joining Date" value={formatDateOnlyDisplay(emp.hire_date)} />
                            <ReadOnlyField label="Employment Status" value={emp.employment_status} />
                            {emp.cnic_number && <ReadOnlyField label="CNIC" value={emp.cnic_number} />}
                            {emp.current_address && <ReadOnlyField label="Address" value={emp.current_address} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

