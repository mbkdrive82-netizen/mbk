"use client";

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import TwoFactorSetup from '@/components/modals/TwoFactorSetup'; // Authenticator App (TOTP)
import { useRouter } from 'next/navigation';


const SettingsModal = ({ isOpen, onClose, onSave, user }) => {
    const router = useRouter();
    const trainerCode =
        user?.trainerCode ||
        user?.trainerId ||
        user?.trainerProfile?.trainerCode ||
        user?.trainerProfile?.trainerId ||
        '';
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        phoneNumber: '',
        city: '',
        specialization: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [show2FA, setShow2FA] = useState(false);
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                email: user.email || '',
                password: '',
                phoneNumber: user.phoneNumber || user.phone || '',
                city: user.city || '',
                specialization: user.specialization || ''
            });
            setTwoFactorEnabled(user.twoFactorEnabled || false);
        }
    }, [user, isOpen]);



    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            // Password changes are handled by backend API
            // onSave will send updates to backend including new password
            // Prepare data for backend: align phoneNumber -> phone
            const saveDate = { 
                ...formData, 
                phone: formData.phoneNumber
            };
            onSave(saveDate);
            onClose();
        } catch (error) {
            console.error("Failed to update settings:", error);
            alert("Failed to update settings: " + error.message);
        }
    };

    const openProfilePage = () => {
        onClose();
        if (user?.role === 'Trainer') {
            router.push('/trainer/profile');
        }
    };



    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="dashboard-modal-scrollport fixed inset-0 z-10 overflow-y-auto">
                    <div className="dashboard-modal-center flex min-h-full items-center justify-center p-4 text-center sm:p-6">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="dashboard-modal-panel relative transform rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                                    <button
                                        type="button"
                                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Close</span>
                                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                    </button>
                                </div>
                                <div className="sm:flex sm:items-start">
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                            {show2FA ? 'Setup Two-Factor Authentication' : 'Account Settings'}
                                        </Dialog.Title>
                                        <div className="mt-2">
                                            {show2FA ? (
                                                <div>
                                                    <TwoFactorSetup userId={user?.id} onComplete={() => { setShow2FA(false); setTwoFactorEnabled(true); }} />
                                                    <div className="mt-4 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShow2FA(false)}
                                                            className="text-sm text-indigo-600 hover:text-indigo-500"
                                                        >
                                                            Back to Settings
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {user?.role === 'Trainer' && (
                                                        <div className="flex flex-col items-center mb-6">
                                                             
                                                            {trainerCode && (
                                                                <div className="mt-3 px-3 py-1 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                                                                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">ID: </span>
                                                                    <span className="text-xs font-bold text-gray-900 font-mono">{trainerCode}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {user?.verificationStatus === 'VERIFIED' && (
                                                        <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex items-start space-x-2">
                                                            <LockClosedIcon className="h-5 w-5 text-indigo-600 mt-0.5" />
                                                            <p className="text-xs text-indigo-800 leading-tight">
                                                                Your account is <strong>Verified</strong>. Personal details are locked for security. 
                                                                Contact support for changes.
                                                            </p>
                                                        </div>
                                                    )}
                                                    <form onSubmit={handleSubmit} className="space-y-4">
                                                        <div>
                                                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                                                                Name
                                                            </label>
                                                            <input
                                                                type="text"
                                                                name="name"
                                                                id="name"
                                                                value={formData.name ?? ''}
                                                                onChange={handleChange}
                                                                disabled={user?.verificationStatus === 'VERIFIED' || user?.role === 'Trainer'}
                                                                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2 ${(user?.verificationStatus === 'VERIFIED' || user?.role === 'Trainer')
                                                                    ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                                                                    : 'focus:border-indigo-500 focus:ring-indigo-500'
                                                                    }`}
                                                                required
                                                            />
                                                            {(user?.verificationStatus === 'VERIFIED' || user?.role === 'Trainer') && (
                                                                <p className="mt-2 text-xs text-gray-500">
                                                                    {user?.role === 'Trainer'
                                                                        ? 'Name is locked for trainer accounts and is managed through the Trainer Profile page.'
                                                                        : 'This value is locked while your account is verified.'}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                                                            <input
                                                                type="email"
                                                                name="email"
                                                                id="email"
                                                                value={formData.email ?? ''}
                                                                onChange={handleChange}
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-gray-100 cursor-not-allowed"
                                                                required
                                                                disabled
                                                            />
                                                            <p className="mt-2 text-xs text-gray-500">
                                                                Email is used for login and important notifications.
                                                            </p>
                                                        </div>

                                                        {user?.role === 'Trainer' && (
                                                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 mb-4">
                                                                <p className="text-sm font-semibold text-blue-900">Trainer account details</p>
                                                                <p className="mt-1 text-xs text-blue-800">
                                                                    Account-level settings are updated here. Trainer-specific fields like phone, city, and specialization should be edited on your Trainer Profile page.
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={openProfilePage}
                                                                    className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                                                >
                                                                    Open My Profile
                                                                </button>
                                                            </div>
                                                        )}

                                                        <div className="relative">
                                                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                                                New Password <span className="text-gray-400 font-normal">(Leave blank to keep current)</span>
                                                            </label>
                                                        <div className="relative">
                                                            <input
                                                                type={showPassword ? "text" : "password"}
                                                                name="password"
                                                                id="password"
                                                                value={formData.password ?? ''}
                                                                onChange={handleChange}
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 pr-10"
                                                                placeholder="••••••••"
                                                            />
                                                            <button
                                                                type="button"
                                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                                                                onClick={() => setShowPassword(!showPassword)}
                                                            >
                                                                {showPassword ? (
                                                                    <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                                                                ) : (
                                                                    <EyeIcon className="h-5 w-5" aria-hidden="true" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                        {/* Hide 2FA for Trainers as requested */}
                                                        {user && user.role !== 'Trainer' && (
                                                            <div className="pt-4 border-t border-gray-200">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h4 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h4>
                                                                        <p className="text-sm text-gray-500">
                                                                            {twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setShow2FA(true)}
                                                                        className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white ${twoFactorEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                                                                    >
                                                                        {twoFactorEnabled ? 'Re-configure' : 'Enable 2FA'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                                            <button
                                                                type="submit"
                                                                className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                                                            >
                                                                Save Changes
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm"
                                                                onClick={onClose}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </form>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
};

export default SettingsModal;
