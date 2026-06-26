"use client";

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const AssignTrainersModal = ({ open, onClose, onSave, college, trainers = [] }) => {
    const [selectedTrainerIds, setSelectedTrainerIds] = useState([]);
    const [trainerSchedules, setTrainerSchedules] = useState({});
    const [expandedTrainers, setExpandedTrainers] = useState({});

    useEffect(() => {
        if (open) {
            setSelectedTrainerIds([]);
            setTrainerSchedules({});
            setExpandedTrainers({});
        }
    }, [open, college]);

    const handleToggle = (trainerId) => {
        setSelectedTrainerIds((prev) => {
            const newSelected = prev.includes(trainerId)
                ? prev.filter((id) => id !== trainerId)
                : [...prev, trainerId];

            // Remove schedules if trainer is deselected
            if (!newSelected.includes(trainerId)) {
                const newSchedules = { ...trainerSchedules };
                delete newSchedules[trainerId];
                setTrainerSchedules(newSchedules);
                const newExpanded = { ...expandedTrainers };
                delete newExpanded[trainerId];
                setExpandedTrainers(newExpanded);
            }

            return newSelected;
        });
    };

    const toggleExpanded = (trainerId) => {
        setExpandedTrainers(prev => ({
            ...prev,
            [trainerId]: !prev[trainerId]
        }));
    };

    const addSchedule = (trainerId) => {
        const newSchedule = {
            id: Date.now(),
            dayOfWeek: 'Monday',
            startTime: '09:00',
            endTime: '11:00',
            subject: ''
        };

        setTrainerSchedules(prev => ({
            ...prev,
            [trainerId]: [...(prev[trainerId] || []), newSchedule]
        }));

        // Auto-expand when adding schedule
        setExpandedTrainers(prev => ({ ...prev, [trainerId]: true }));
    };

    const removeSchedule = (trainerId, scheduleId) => {
        setTrainerSchedules(prev => ({
            ...prev,
            [trainerId]: prev[trainerId].filter(s => s.id !== scheduleId)
        }));
    };

    const updateSchedule = (trainerId, scheduleId, field, value) => {
        setTrainerSchedules(prev => ({
            ...prev,
            [trainerId]: prev[trainerId].map(s =>
                s.id === scheduleId ? { ...s, [field]: value } : s
            )
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validate that all added schedules have both start time and end time filled in
        for (const trainerId of selectedTrainerIds) {
            const schedules = trainerSchedules[trainerId] || [];
            for (const schedule of schedules) {
                if (!schedule.startTime || !schedule.endTime) {
                    alert("Please fill in both start time and end time for all schedules.");
                    return;
                }
            }
        }

        // Format data for backend API
        const trainersData = selectedTrainerIds.map(trainerId => ({
            trainerId,
            schedules: (trainerSchedules[trainerId] || []).map(({ id, ...schedule }) => schedule)
        }));

        onSave(college.id, trainersData);
        onClose();
    };

    return (
        <Transition.Root show={open} as={Fragment}>
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
                                            Assign Trainers to {college?.name}
                                        </Dialog.Title>
                                        <div className="mt-4 max-h-96 overflow-y-auto">
                                            <ul className="divide-y divide-gray-200">
                                                {trainers.map((trainer) => (
                                                    <li key={trainer.id} className="py-3">
                                                        <div className="flex items-center">
                                                            <input
                                                                id={`trainer-${trainer.id}`}
                                                                name={`trainer-${trainer.id}`}
                                                                type="checkbox"
                                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                                checked={selectedTrainerIds.includes(trainer.id)}
                                                                onChange={() => handleToggle(trainer.id)}
                                                            />
                                                            <label
                                                                htmlFor={`trainer-${trainer.id}`}
                                                                className="ml-3 block text-sm font-medium text-gray-700 cursor-pointer flex-1"
                                                            >
                                                                {trainer.name} <span className="text-gray-500 text-xs">({trainer.email})</span>
                                                            </label>
                                                            {selectedTrainerIds.includes(trainer.id) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpanded(trainer.id)}
                                                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                                                >
                                                                    {expandedTrainers[trainer.id] ? 'Hide' : 'Show'} Schedules
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Schedule Management Section */}
                                                        {selectedTrainerIds.includes(trainer.id) && expandedTrainers[trainer.id] && (
                                                            <div className="ml-7 mt-3 space-y-3 bg-gray-50 p-3 rounded-md">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => addSchedule(trainer.id)}
                                                                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded hover:bg-indigo-200"
                                                                >
                                                                    <PlusIcon className="h-3 w-3 mr-1" />
                                                                    Add Schedule
                                                                </button>

                                                                {/* Display Schedules */}
                                                                {trainerSchedules[trainer.id]?.map((schedule) => (
                                                                    <div key={schedule.id} className="bg-white p-3 rounded border border-gray-200">
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div>
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                    Day
                                                                                </label>
                                                                                <select
                                                                                    value={schedule.dayOfWeek}
                                                                                    onChange={(e) => updateSchedule(trainer.id, schedule.id, 'dayOfWeek', e.target.value)}
                                                                                    className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                                >
                                                                                    {DAYS_OF_WEEK.map(day => (
                                                                                        <option key={day} value={day}>{day}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                    Subject
                                                                                </label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={schedule.subject}
                                                                                    onChange={(e) => updateSchedule(trainer.id, schedule.id, 'subject', e.target.value)}
                                                                                    placeholder="e.g., Java Programming"
                                                                                    className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                    Start Time
                                                                                </label>
                                                                                <input
                                                                                    type="time"
                                                                                    value={schedule.startTime}
                                                                                    onChange={(e) => updateSchedule(trainer.id, schedule.id, 'startTime', e.target.value)}
                                                                                    className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                    End Time
                                                                                </label>
                                                                                <input
                                                                                    type="time"
                                                                                    value={schedule.endTime}
                                                                                    onChange={(e) => updateSchedule(trainer.id, schedule.id, 'endTime', e.target.value)}
                                                                                    className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeSchedule(trainer.id, schedule.id)}
                                                                            className="mt-2 inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                                                                        >
                                                                            <TrashIcon className="h-3 w-3 mr-1" />
                                                                            Remove
                                                                        </button>
                                                                    </div>
                                                                ))}

                                                                {(!trainerSchedules[trainer.id] || trainerSchedules[trainer.id].length === 0) && (
                                                                    <p className="text-xs text-gray-500 italic">No schedules added yet.</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                                {trainers.length === 0 && (
                                                    <li className="py-3 text-sm text-gray-500 italic">No trainers available.</li>
                                                )}
                                            </ul>
                                        </div>
                                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                            <button
                                                type="button"
                                                className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                                                onClick={handleSubmit}
                                            >
                                                Assign
                                            </button>
                                            <button
                                                type="button"
                                                className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm"
                                                onClick={onClose}
                                            >
                                                Cancel
                                            </button>
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

export default AssignTrainersModal;
