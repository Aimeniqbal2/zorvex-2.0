import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { TokenManager } from './tokenManager';
import { apiClient } from '../api/client';
import { ZorvexLoadingScreen } from '../components/ui/ZorvexLoadingScreen';
import './Login.css';

const MESSAGES = [
    { icon: 'bx-rocket', text: 'Boost your business productivity by up to 40% with Zorvex.' },
    { icon: 'bx-shield-quarter', text: 'Bank-grade security ensures your company data is always safe.' },
    { icon: 'bx-line-chart', text: 'Real-time analytics to help you make smarter business decisions.' },
    { icon: 'bx-group', text: 'Seamlessly manage your entire team across multiple locations.' },
    { icon: 'bx-money', text: 'Automated POS and billing integrated directly with your inventory.' }
];

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const setAuth = useAuthStore((state) => state.setAuth);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    const [isLoading, setIsLoading] = useState(false);
    const [showGlobalLoader, setShowGlobalLoader] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isShaking, setIsShaking] = useState(false);

    const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

    // Marketing Popups State
    const [visiblePopups, setVisiblePopups] = useState<Array<{ id: number; msg: typeof MESSAGES[0]; status: 'show' | 'hide' }>>([]);
    const popupIdCounter = useRef(0);
    const msgIndex = useRef(0);

    useEffect(() => {
        // Load saved credentials
        const savedUser = localStorage.getItem('remembered_username');
        const savedPass = localStorage.getItem('remembered_password');
        if (savedUser) {
            setUsername(savedUser);
            if (savedPass) setPassword(savedPass);
            setRememberMe(true);
        }
    }, []);

    useEffect(() => {
        // Particle Generator
        const interval = setInterval(() => {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = (Math.random() * 100) + '%';
            p.style.top = (90 + Math.random() * 10) + 'vh';
            const size = Math.random() * 4 + 2;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.animationDuration = (Math.random() * 7 + 8) + 's';
            p.style.zIndex = '1';
            
            const wrapper = document.querySelector('.login-page-wrapper');
            if (wrapper) {
                wrapper.appendChild(p);
                setTimeout(() => p.remove(), 16000);
            }
        }, 150);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Marketing Popups
        const interval = setInterval(() => {
            setVisiblePopups(prev => {
                let updated = [...prev];
                
                // Hide the oldest if there are 3 or more
                if (updated.length >= 3) {
                    updated[0] = { ...updated[0], status: 'hide' };
                    // Clean up hidden popups after animation
                    setTimeout(() => {
                        setVisiblePopups(current => current.filter(p => p.status !== 'hide'));
                    }, 600);
                }

                if (msgIndex.current >= MESSAGES.length) msgIndex.current = 0;
                
                const newPopup = {
                    id: popupIdCounter.current++,
                    msg: MESSAGES[msgIndex.current++],
                    status: 'show' as const
                };
                
                return [...updated, newPopup];
            });
        }, 4500);

        return () => clearInterval(interval);
    }, []);

    const triggerShake = () => {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setErrorMsg('');
        setIsLoading(true);

        const credentials = {
            username: username.trim(),
            password: password,
            remember_me: rememberMe
        };

        if (rememberMe) {
            localStorage.setItem('remembered_username', credentials.username);
            localStorage.setItem('remembered_password', credentials.password);
        } else {
            localStorage.removeItem('remembered_username');
            localStorage.removeItem('remembered_password');
        }

        try {
            const response = await apiClient.post('/api/auth/login/', credentials);
            
            if (response.data && response.data.access) {
                TokenManager.setTokens(response.data.access, response.data.refresh);
                
                // Show compulsory dark loading screen upon login
                setShowGlobalLoader(true);
                
                setTimeout(() => {
                    setAuth(response.data.access);
                    // Navigate to intended destination or root
                    const from = location.state?.from?.pathname || '/';
                    navigate(from, { replace: true });
                }, 1600);
            }
        } catch (err: any) {
            if (err.response) {
                setErrorMsg(err.response.data?.detail || 'Access Denied. Account expired or invalid credentials.');
            } else {
                setErrorMsg('Network disconnection. Is the Django Server alive?');
            }
            triggerShake();
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page-wrapper">
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>

            <div className="login-wrapper">
                <div className={`card minimal-card ${isShaking ? 'shake' : ''}`}>
                    <div className="left">
                        <div className="logo">
                            <img src="/app/assets/zorvex-logo.png" alt="ZORVEX Logo" />
                        </div>

                        <div style={{ color: '#ff6b6b', fontSize: '13px', textAlign: 'center', marginBottom: '10px', opacity: errorMsg ? 1 : 0, transition: '0.3s' }}>
                            {errorMsg || ' '}
                        </div>
                        
                        <form onSubmit={handleLogin}>
                            <div className="input-box">
                                <input 
                                    type="text" 
                                    placeholder="Username" 
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    required 
                                />
                            </div>

                            <div className="input-box" style={{ position: 'relative' }}>
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    placeholder="Password" 
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required 
                                />
                                <span 
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: '15px', top: '14px', fontSize: '12px', color: '#aaa', cursor: 'pointer' }}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </span>
                            </div>

                            <div className="options">
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                    /> 
                                    Remember me
                                </label>
                                <a href="#" className="forgot-link" onClick={(e) => { e.preventDefault(); setIsForgotModalOpen(true); }}>Forgot?</a>
                            </div>

                            <button type="submit" disabled={isLoading}>
                                <span className="btn-text" style={{ display: isLoading ? 'none' : 'inline-block' }}>Login</span>
                                <span className="btn-loader" style={{ display: isLoading ? 'inline-block' : 'none' }}>Logging in...</span>
                            </button>
                        </form>
                    </div>

                    <div className="right"></div>
                </div>
            </div>

            {/* Forgot Password Modal */}
            <div className={`modal-overlay ${isForgotModalOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setIsForgotModalOpen(false); }}>
                <div className="modal-box">
                    <h3>Reset Password</h3>
                    <p style={{ marginBottom: '12px' }}>If you are a Staff Member, please contact your system administrator to request a password reset or retrieve your login credentials.</p>
                    <p>If you are a Company Administrator, please reach out to your software provider for assistance with account recovery.</p>
                    <button className="modal-btn" onClick={() => setIsForgotModalOpen(false)}>Understood</button>
                </div>
            </div>

            {/* Full-screen Dark Zorvex Loading Screen on Login */}
            {showGlobalLoader && (
                <ZorvexLoadingScreen 
                    variant="dark" 
                    fullScreen={true} 
                    message="Initializing Zorvex Workspace..."
                />
            )}

            {/* Marketing Popups */}
            <div className="marketing-popups">
                {visiblePopups.map((popup) => (
                    <div key={popup.id} className={`marketing-popup ${popup.status}`}>
                        <i className={`bx ${popup.msg.icon}`}></i>
                        <div>{popup.msg.text}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
