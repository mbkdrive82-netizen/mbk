"use client";

import { memo } from 'react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
    HomeIcon,
    BuildingOfficeIcon,
    UsersIcon,
    CreditCardIcon,
    ClipboardDocumentListIcon,
    DocumentCheckIcon,
    CurrencyRupeeIcon,
    BanknotesIcon,
    ChartBarIcon,
    ClockIcon,
    BuildingLibraryIcon,
    UserGroupIcon,
    ClipboardDocumentCheckIcon,
    UserCircleIcon,
    CalendarIcon as Calendar,
    MapPinIcon,
    ChatBubbleLeftRightIcon,
    Cog6ToothIcon,
    ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { updateTrainerProfile } from '@/services/trainerService';
import { useTheme } from 'next-themes';

// ✅ Lazy-load heavy modals and bell
const SettingsModal = dynamic(() => import('@/components/modals/SettingsModal'), { ssr: false });
const NdaManagementModal = dynamic(() => import('@/components/modals/NdaManagementModal'), { ssr: false });
const NotificationBell = dynamic(() => import('@/components/common/NotificationBell'), { ssr: false });

// Temporary NavLink shim if it's not imported properly (check if it exists in scope)
// In some migrations NavLink is a custom component.
const NavLink = ({ children, to, className, ...props }) => {
    const router = useRouter();
    const pathname = window.location.pathname;
    const isActive = pathname === to || pathname.startsWith(to + '/');
    const classResult = typeof className === 'function' ? className({ isActive }) : className;

    return (
        <a 
            href={to} 
            onClick={(e) => { e.preventDefault(); router.push(to); }} 
            className={classResult} 
            {...props}
        >
            {typeof children === 'function' ? children({ isActive }) : children}
        </a>
    );
};


const Sidebar = () => {
    const router = useRouter();
    const { currentUser, logout, setAuthUser } = useAuth();
    const { theme, setTheme } = useTheme();
    // Temporary fallback or assuming currentUser has role merged
    const user = currentUser || {};
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
    const [isNdaManagementOpen, setIsNdaManagementOpen] = useState(false);
    const userMenuRef = useRef(null);

    const navigation = [
        // Super Admin Links
        { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, roles: ['SuperAdmin'] },
        { name: 'Companies', href: '/companies', icon: BuildingOfficeIcon, roles: ['SuperAdmin'] },
        { name: 'Trainers', href: '/trainers', icon: UsersIcon, roles: ['SuperAdmin'] },
        { name: 'Verify Documents', href: '/documents', icon: DocumentCheckIcon, roles: ['SuperAdmin'] },
        { name: 'Trainer Activity', href: '/trainer-activity', icon: ClipboardDocumentListIcon, roles: ['SuperAdmin'] },
        { name: 'Overall Attendance', href: '/attendance', icon: ClockIcon, roles: ['SuperAdmin'] },
        { name: 'Salary Management', href: '/salary', icon: CurrencyRupeeIcon, roles: ['SuperAdmin'] },
        { name: 'City Management', href: '/cities', icon: MapPinIcon, roles: ['SuperAdmin'] },
        { name: 'Trainer Complaints', href: '/complaints', icon: ChatBubbleLeftRightIcon, roles: ['SuperAdmin'] },

        // SPOC Admin Links
        { name: 'Dashboard', href: '/spoc/dashboard', icon: HomeIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },
        { name: 'Scheduler', href: '/spoc/schedule', icon: Calendar, roles: ['SPOCAdmin', 'CollegeAdmin'] },
        { name: 'Trainers', href: '/spoc/trainers', icon: UsersIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },
        { name: 'Check-In Verify', href: '/spoc/attendance', icon: ClipboardDocumentCheckIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },
        { name: 'Check-Out Status', href: '/spoc/geo-verification', icon: MapPinIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },

        { name: 'Overall Attendance', href: '/spoc/overall-attendance', icon: ClockIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },
        { name: 'Assigned Complaints', href: '/spoc/complaints', icon: ChatBubbleLeftRightIcon, roles: ['SPOCAdmin', 'CollegeAdmin'] },

        // Accountant Links
        { name: 'Dashboard', href: '/accountant/dashboard', icon: HomeIcon, roles: ['Accountant', 'Accountnt'] },
        { name: 'Salary Reports', href: '/accountant/salary', icon: CurrencyRupeeIcon, roles: ['Accountant', 'Accountnt'] },
        { name: 'Bank Details', href: '/accountant/bank-details', icon: BuildingLibraryIcon, roles: ['Accountant', 'Accountnt'] },
        { name: 'Monthly Reports', href: '/accountant/reports', icon: ChartBarIcon, roles: ['Accountant', 'Accountnt'] },
        { name: 'Statements', href: '/accountant/statements', icon: ClipboardDocumentListIcon, roles: ['Accountant', 'Accountnt'] },
        { name: 'Payment Complaints', href: '/dashboard/complaints', icon: ChatBubbleLeftRightIcon, roles: ['Accountant', 'Accountnt'] },

        // Trainer Links
        { name: 'Dashboard', href: '/trainer/dashboard', icon: HomeIcon, roles: ['Trainer'] },
        { name: 'Schedule', href: '/trainer/schedule', icon: ClockIcon, roles: ['Trainer'] },
        { name: 'Pay Slips', href: '/trainer/payslips', icon: CurrencyRupeeIcon, roles: ['Trainer'] },
    ];

    // Filter navigation based on user role
    const filteredNavigation = navigation.filter(item => {
        if (!item.roles.includes(user?.role)) return false;

        return true;
    });

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setIsUserMenuOpen(false);
                setIsQuickSettingsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const handleLogout = async () => {
        setIsUserMenuOpen(false);
        setIsQuickSettingsOpen(false);
        try {
            await logout();
            router.push('/');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    const handleSettingsSave = async (data) => {
        try {
            const userId = user.id || user._id || user.uid;
            if (!userId) {
                throw new Error('User ID not found');
            }

            let response;
            if (user.role === 'Trainer') {
                response = await updateTrainerProfile(data);
            } else {
                response = await api.put(`/users/${userId}`, data);
            }

            if (response.success || response.message) {
                const updatedUser = response.user || { ...JSON.parse(localStorage.getItem('user') || '{}'), ...data };
                setAuthUser(updatedUser);
                setIsSettingsOpen(false);

                if (data.password) {
                    await handleLogout();
                }
            } else {
                alert(response.message || 'Failed to update settings');
            }
        } catch (error) {
            console.error('Error updating settings:', error);
            alert(error.message || 'Failed to update settings');
        }
    };

    const handleProfileClick = () => {
        setIsUserMenuOpen(false);
        setIsQuickSettingsOpen(false);
        if (user?.role === 'Trainer') {
            router.push('/trainer/profile');
            return;
        }
        setIsSettingsOpen(true);
    };

    const handleSettingsClick = () => {
        setIsUserMenuOpen(false);
        setIsQuickSettingsOpen((prev) => !prev);
    };

    const openUserAccountManagement = () => {
        setIsQuickSettingsOpen(false);
        router.push('/dashboard/accounts');
    };

    const openNdaManagement = () => {
        setIsQuickSettingsOpen(false);
        setIsNdaManagementOpen(true);
    };

    return (
        <>
            <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
                <div className="flex-1 flex flex-col min-h-0 bg-[rgb(21,62,83)]">
                    <div className="flex items-center h-16 shrink-0 px-4 bg-[rgb(21,62,83)] border-b border-[rgb(17,49,66)]">
                        <h1 className="text-xl font-bold text-white">
                            {user?.role === 'SPOCAdmin' ? 'SPOC Portal' :
                                user?.role === 'CollegeAdmin' ? 'College Portal' :
                                    (user?.role === 'Accountant' || user?.role === 'Accountnt') ? 'Finance Portal' :
                                        user?.role === 'Trainer' ? 'Trainer Portal' :
                                            'Admin Portal'}
                        </h1>
                    </div>
                    <div className="flex-1 flex flex-col overflow-y-auto">
                        <nav className="flex-1 py-4 space-y-1">
                            {filteredNavigation.map((item) => {
                                // Special check for Trainer Dashboard to prevent highlighting on sub-routes
                                const isTrainerDashboard = item.href === '/trainer/dashboard';

                                return (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        className={({ isActive }) => {
                                            // Override isActive for /trainer/dashboard so it only highlights when exactly that path
                                            // Since react-router v6 NavLink 'end' prop doesn't always work as expected with nested routing
                                            const isCurrentlyActive = isTrainerDashboard 
                                                ? window.location.pathname === '/trainer/dashboard' || window.location.pathname === '/trainer' 
                                                : isActive;

                                            return `group flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 ease-in-out relative ${isCurrentlyActive
                                                ? 'bg-[rgb(17,49,66)] text-accentLight!'
                                                : 'text-white! hover:bg-[rgb(17,49,66)] hover:text-accentLight!'
                                            }`;
                                        }}
                                        end={isTrainerDashboard}
                                    >
                                        {({ isActive }) => {
                                            const isCurrentlyActive = isTrainerDashboard 
                                                ? window.location.pathname === '/trainer/dashboard' || window.location.pathname === '/trainer' 
                                                : isActive;
                                                
                                            return (
                                            <>
                                                {isCurrentlyActive && (
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-accentLight" />
                                                )}
                                                <item.icon
                                                    className={`mr-3 h-5 w-5 shrink-0 transition-colors ${isCurrentlyActive ? 'text-accentLight!' : 'text-white! group-hover:text-accentLight!'}`}
                                                    aria-hidden="true"
                                                />
                                                {item.name}
                                            </>
                                        )}}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>
                    <div ref={userMenuRef} className="relative shrink-0 bg-[rgb(17,49,66)] p-4 border-t border-[rgb(21,62,83)]">
                        {isQuickSettingsOpen && (
                            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-lg bg-white shadow-lg border border-gray-200 overflow-hidden z-30">
                                <div className="px-3 py-2 border-b border-gray-100">
                                    <p className="text-xs font-semibold text-gray-700">Settings</p>
                                </div>
                                <div className="p-3">
                                    <p className="text-xs text-gray-500 mb-2">Theme</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setTheme('light')}
                                            className={`rounded-md px-2 py-1 text-xs font-medium border ${theme === 'light' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Light
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTheme('dark')}
                                            className={`rounded-md px-2 py-1 text-xs font-medium border ${theme === 'dark' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Dark
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTheme('system')}
                                            className={`rounded-md px-2 py-1 text-xs font-medium border ${theme === 'system' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            System
                                        </button>
                                    </div>

                                    {user?.role === 'SuperAdmin' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={openUserAccountManagement}
                                                className="mt-3 w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md border border-gray-200"
                                            >
                                                <UserGroupIcon className="h-4 w-4 mr-2 text-gray-500" />
                                                User Account Management
                                            </button>
                                            <button
                                                type="button"
                                                onClick={openNdaManagement}
                                                className="mt-2 w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md border border-gray-200"
                                            >
                                                <ClipboardDocumentListIcon className="h-4 w-4 mr-2 text-gray-500" />
                                                NDA Management
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {isUserMenuOpen && (
                            <div className="absolute bottom-full left-3 right-3 z-30 mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                                <div className="p-2">
                                    <button
                                        type="button"
                                        onClick={handleProfileClick}
                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                    >
                                        <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                                            <UserCircleIcon className="h-4 w-4 text-slate-500" />
                                        </span>
                                        Profile
                                    </button>
                                    {user?.role === 'Trainer' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsUserMenuOpen(false);
                                                router.push('/trainer/complaints');
                                            }}
                                            className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                                                <ChatBubbleLeftRightIcon className="h-4 w-4 text-slate-500" />
                                            </span>
                                            Complaints & Feedback
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSettingsClick}
                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                    >
                                        <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                                            <Cog6ToothIcon className="h-4 w-4 text-slate-500" />
                                        </span>
                                        Settings
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                                    >
                                        <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-rose-50">
                                            <ArrowRightOnRectangleIcon className="h-4 w-4 text-rose-500" />
                                        </span>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between w-full">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsQuickSettingsOpen(false);
                                    setIsUserMenuOpen((prev) => !prev);
                                }}
                                className="flex items-center text-left flex-1 min-w-0"
                            >
                                <div className="h-9 w-9 shrink-0 rounded-full bg-accent flex items-center justify-center text-white font-bold">
                                    {(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-3 truncate">
                                    <p className="text-sm font-medium text-white truncate">{user?.name || user?.displayName || user?.email}</p>
                                    <p className="text-xs font-medium text-accentLight truncate">
                                        {user?.role || 'User'}
                                    </p>
                                </div>
                            </button>
                            <div className="ml-2 shrink-0">
                                <NotificationBell 
                                    iconClassName="h-6 w-6 text-white hover:text-accentLight transition-colors"
                                    badgeClassName="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-[#113142]"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onSave={handleSettingsSave}
                user={user}
            />
            <NdaManagementModal
                isOpen={isNdaManagementOpen}
                onClose={() => setIsNdaManagementOpen(false)}
            />
        </>
    );
};

export default memo(Sidebar);
