import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { registrationInit, verifyOtp } from '@/services/authService';

const EmailOTP = ({ email, password, onSuccess, onCancel }) => {
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    const handleSendOTP = async () => {
        if (!email) return;
        setIsLoading(true);
        setError('');
        setMessage('Sending OTP to your email...');

        try {
            const data = await registrationInit({ email, password });

            if (data?.success !== false) {
                setOtpSent(true);
                setMessage('OTP Sent Successfully. Please check your email inbox.');
            } else {
                setError(data.message || 'Failed to send OTP.');
                setMessage('');
            }
        } catch (err) {
            console.error(err);
            setError(err?.message || 'Network error. Failed to send OTP.');
            setMessage('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!otp || otp.length < 4) {
            setError('Please enter the OTP.');
            return;
        }

        setIsLoading(true);
        setError('');
        setMessage('Verifying...');

        try {
            const data = await verifyOtp({ email, otp });

            if (data?.success !== false) {
                setMessage('Verified Successfully! Logging you in...');
                if (onSuccess) onSuccess();
            } else {
                setError(data.message || 'Invalid OTP.');
                setMessage('');
            }
        } catch (err) {
            console.error(err);
            setError(err?.message || 'Network error. Failed to verify OTP.');
            setMessage('');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-500/20 text-teal-400 mb-3">
                    <Mail size={24} />
                </div>
                <h3 className="text-xl font-semibold text-white">Verify Your Email</h3>
                <p className="text-sm text-slate-300 mt-2">
                    Your account needs email verification before you can sign in.
                </p>
                <div className="font-medium text-teal-300 mt-1">{email}</div>
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {message && !error && (
                <div className="flex items-center gap-2 bg-teal-500/20 border border-teal-500/50 text-teal-200 p-3 rounded mb-4 text-sm">
                    {otpSent ? <CheckCircle size={16} className="shrink-0" /> : <Loader size={16} className="animate-spin shrink-0" />}
                    <span>{message}</span>
                </div>
            )}

            {!otpSent ? (
                <div className="space-y-4">
                    <button
                        onClick={handleSendOTP}
                        disabled={isLoading}
                        className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader size={18} className="animate-spin" /> : <Mail size={18} />}
                        Send OTP to Email
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="w-full text-slate-400 hover:text-white py-2 text-sm transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Enter 6-digit OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 text-white rounded px-4 py-3 text-center text-lg tracking-widest focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                        maxLength={6}
                    />
                    <button
                        onClick={handleVerifyOTP}
                        disabled={isLoading || !otp}
                        className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                        Verify & Continue
                    </button>
                    <div className="flex items-center justify-between mt-4">
                        <button
                            onClick={handleSendOTP}
                            disabled={isLoading}
                            className="text-teal-400 hover:text-teal-300 text-sm disabled:opacity-50"
                        >
                            Resend OTP
                        </button>
                        <button
                            onClick={onCancel}
                            disabled={isLoading}
                            className="text-slate-400 hover:text-slate-300 text-sm disabled:opacity-50"
                        >
                            Back to Login
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailOTP;
