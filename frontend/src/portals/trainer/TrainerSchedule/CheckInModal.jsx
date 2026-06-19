"use client";

import { memo, useEffect, useState } from "react";
import {
  ArrowRightOnRectangleIcon,
  CameraIcon,
  CheckCircleIcon,
  MapPinIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

const optimizeImage = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        }, "image/jpeg", 0.7);
      };
    };
  });

const CheckInModal = ({
  attendanceData,
  fetchingStudents,
  fetchStudentsForCollege,
  getLiveLocation,
  handleCheckInSubmit,
  handleStudentCheck,
  locationStatus,
  onClose,
  selectedSchedule,
  setAttendanceData,
  studentAttendance,
  students,
}) => {
  const [scannedImages, setScannedImages] = useState([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!selectedSchedule) {
      return;
    }

    fetchStudentsForCollege(selectedSchedule.collegeId);
    getLiveLocation().catch((error) => console.error("Auto-location failed:", error));
  }, [fetchStudentsForCollege, getLiveLocation, selectedSchedule]);

  const handlePdfScan = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const optimizedFile = await optimizeImage(file);
      setScannedImages((previous) => [...previous, optimizedFile]);
    } catch (error) {
      console.error("Optimization error:", error);
      setScannedImages((previous) => [...previous, file]);
    }
  };

  const generatePdfFromImages = async () => {
    if (!scannedImages.length) {
      return;
    }

    try {
      setIsGeneratingPdf(true);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      const totalPages = scannedImages.length;
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < totalPages; index += 1) {
        const item = scannedImages[index];
        if (index > 0) {
          pdf.addPage();
        }

        const objectUrl = typeof item === "string" ? item : URL.createObjectURL(item);

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.src = objectUrl;
          img.onload = () => {
            let finalWidth = pdfWidth;
            let finalHeight = (img.height * pdfWidth) / img.width;

            if (finalHeight > pdfHeight) {
              finalHeight = pdfHeight;
              finalWidth = (img.width * pdfHeight) / img.height;
            }

            pdf.addImage(img, "JPEG", 0, 0, finalWidth, finalHeight, undefined, "FAST");
            if (typeof item !== "string") {
              URL.revokeObjectURL(objectUrl);
            }
            setTimeout(resolve, 50);
          };
          img.onerror = () => {
            if (typeof item !== "string") {
              URL.revokeObjectURL(objectUrl);
            }
            reject(new Error(`Failed to process page ${index + 1}`));
          };
        });
      }

      const pdfBlob = pdf.output("blob");
      const pdfFile = new File([pdfBlob], `attendance_${Date.now()}.pdf`, {
        type: "application/pdf",
      });

      setAttendanceData((previous) => ({
        ...previous,
        attendancePdf: pdfFile,
      }));
      setScannedImages([]);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="dashboard-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-white/40 p-4 backdrop-blur-sm sm:bg-white/60">
      <div className="dashboard-modal-panel h-full w-full overflow-y-auto bg-white p-4 sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-xl sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Check In</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="bg-indigo-50 rounded-lg p-4 mb-6 border border-indigo-100 shadow-sm">
          <h3 className="text-lg font-bold text-indigo-900 leading-tight">{selectedSchedule.college}</h3>
          <p className="text-sm font-semibold text-indigo-600 mt-1">{selectedSchedule.course}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-indigo-700">
            <span className="bg-white px-2 py-0.5 rounded border border-indigo-100 font-bold">
              Day {selectedSchedule.dayNumber}
            </span>
            <span>{selectedSchedule.date}</span>
            <span className="text-indigo-400">|</span>
            <span>{selectedSchedule.time}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`rounded-xl p-3 border ${
            locationStatus.detected
              ? "bg-green-50/50 border-green-100"
              : locationStatus.error
                ? "bg-red-50/50 border-red-100"
                : "bg-blue-50/50 border-blue-100"
          } mb-2`}>
            <div className="flex items-center gap-2 mb-1">
              <MapPinIcon className={`h-4 w-4 ${
                locationStatus.detected
                  ? "text-green-600"
                  : locationStatus.error
                    ? "text-red-500"
                    : "text-blue-500 animate-pulse"
              }`} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Session Geo-Location
              </span>
            </div>
            {locationStatus.loading ? (
              <p className="text-xs text-blue-600 font-medium animate-pulse italic">
                Detecting high-accuracy location...
              </p>
            ) : null}
            {locationStatus.detected && locationStatus.details ? (
              <div className="space-y-1">
                <p className="text-xs text-green-700 font-black">Location detected successfully</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 font-mono text-[10px] text-gray-500">
                  <p>LATITUDE : {locationStatus.details.lat.toFixed(4)}</p>
                  <p>LONGITUDE: {locationStatus.details.lng.toFixed(4)}</p>
                  <p>ACCURACY : {locationStatus.details.accuracy} meters</p>
                  <p className="text-green-600 font-bold uppercase tracking-tighter">Auto Captured</p>
                </div>
              </div>
            ) : null}
            {locationStatus.error ? (
              <p className="text-xs text-red-600 font-bold italic bg-white p-2 rounded border border-red-100 mt-1">
                {locationStatus.error}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="checkin-syllabus" className="block text-sm font-medium text-gray-700 mb-1">
              Syllabus / Topic
            </label>
            <input
              type="text"
              id="checkin-syllabus"
              value={attendanceData.syllabus || ""}
              onChange={(event) =>
                setAttendanceData((previous) => ({ ...previous, syllabus: event.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter topic covered"
            />
          </div>

          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-gray-800">Student Attendance</h3>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                Total: {students.length}
              </span>
            </div>

            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-inner overscroll-contain">
              {fetchingStudents ? (
                <div className="p-4 text-center text-xs text-gray-500">Loading student list...</div>
              ) : !students.length ? (
                <div className="p-4 text-center text-xs text-gray-500 italic">
                  No students found for this college
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Roll</th>
                      <th className="px-2 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Register</th>
                      <th className="px-2 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-2 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Present</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {students.map((student) => (
                      <tr key={student._id} className="hover:bg-indigo-50 transition-colors">
                        <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600 font-mono">
                          {student.rollNo}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-[10px] text-gray-400 font-mono">
                          {student.registerNo}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-900 font-medium">{student.name}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={!!studentAttendance[student._id]}
                            onChange={() => handleStudentCheck(student._id)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="checkin-time" className="block text-sm font-medium text-gray-700 mb-1">
              Check-in Time
            </label>
            <input
              type="time"
              id="checkin-time"
              value={attendanceData.checkInTime}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed focus:ring-0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="checkin-students-present" className="block text-sm font-medium text-gray-700 mb-1">
                Students Present
              </label>
              <input
                type="number"
                id="checkin-students-present"
                value={attendanceData.studentsPresent}
                onChange={(event) =>
                  setAttendanceData((previous) => ({ ...previous, studentsPresent: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="checkin-students-absent" className="block text-sm font-medium text-gray-700 mb-1">
                Students Absent
              </label>
              <input
                type="number"
                id="checkin-students-absent"
                value={attendanceData.studentsAbsent}
                onChange={(event) =>
                  setAttendanceData((previous) => ({ ...previous, studentsAbsent: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Student Attendance (PDF)</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <button className="w-full flex items-center justify-center gap-2 px-3 py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group">
                  <div className="text-center">
                    <ArrowRightOnRectangleIcon className="h-6 w-6 mx-auto text-gray-400 group-hover:text-indigo-600 transform -rotate-90" />
                    <span className="block text-xs font-medium text-gray-600 mt-1">Upload PDF</span>
                  </div>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) =>
                      setAttendanceData((previous) => ({
                        ...previous,
                        attendancePdf: event.target.files?.[0] || null,
                      }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </button>
              </div>

              <div className="w-full flex flex-col gap-2">
                <div className="relative">
                  <button className="w-full flex items-center justify-center gap-2 px-3 py-4 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 hover:border-indigo-500 hover:bg-indigo-50 transition-all group">
                    <div className="text-center">
                      <CameraIcon className="h-6 w-6 mx-auto text-indigo-400 group-hover:text-indigo-600" />
                      <span className="block text-xs font-medium text-indigo-600 mt-1">
                        {scannedImages.length ? `Add Page (${scannedImages.length} captured)` : "Scan / Take Photo"}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePdfScan}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </button>
                </div>

                {scannedImages.length ? (
                  <>
                    <button
                      type="button"
                      onClick={generatePdfFromImages}
                      disabled={isGeneratingPdf}
                      className={`w-full py-2 rounded-lg text-xs font-bold shadow-sm transition-all ${
                        isGeneratingPdf
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {isGeneratingPdf ? (
                        <span className="flex items-center justify-center">
                          <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Creating PDF...
                        </span>
                      ) : "Finish Scan & Create PDF"}
                    </button>

                    {!isGeneratingPdf ? (
                      <button
                        type="button"
                        onClick={() => setScannedImages([])}
                        className="w-full py-1 text-[10px] text-gray-500 hover:text-red-500 font-medium transition-colors"
                      >
                        Clear All Pages
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {attendanceData.attendancePdf ? (
              <div className="mt-3 flex items-center justify-between p-2 bg-green-50 border border-green-100 rounded-lg">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-xs text-green-700 font-medium truncate max-w-[150px]">
                    {attendanceData.attendancePdf.name}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setAttendanceData((previous) => ({ ...previous, attendancePdf: null }))}
                  className="text-xs text-red-500 hover:text-red-700 font-bold"
                >
                  X
                </button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Attendance Excel</label>
                <div className="relative rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center bg-white hover:border-indigo-500 transition-all">
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(event) =>
                      setAttendanceData((previous) => ({
                        ...previous,
                        attendanceExcel: event.target.files?.[0] || null,
                      }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-xs text-gray-600">
                    {attendanceData.attendanceExcel ? attendanceData.attendanceExcel.name : 'Upload Excel'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trainer Signature</label>
                <div className="relative rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center bg-white hover:border-indigo-500 transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setAttendanceData((previous) => ({
                        ...previous,
                        signature: event.target.files?.[0] || null,
                      }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-xs text-gray-600">
                    {attendanceData.signature ? attendanceData.signature.name : 'Upload Signature'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Check-In Image</label>
                <div className="relative rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center bg-white hover:border-indigo-500 transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) =>
                      setAttendanceData((previous) => ({
                        ...previous,
                        checkInImage: event.target.files?.[0] || null,
                      }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-xs text-gray-600">
                    {attendanceData.checkInImage ? attendanceData.checkInImage.name : 'Upload Image'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            {locationStatus.detected && locationStatus.details ? (
              <span className="text-green-600 flex items-center">
                <MapPinIcon className="h-3 w-3 mr-1" />
                Location captured: {locationStatus.details.lat.toFixed(4)}, {locationStatus.details.lng.toFixed(4)}
              </span>
            ) : (
              <span className="text-yellow-600 flex items-center">
                <MapPinIcon className="h-3 w-3 mr-1" />
                Fetching location...
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleCheckInSubmit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center"
          >
            <CheckCircleIcon className="h-5 w-5 mr-2" />
            Check In
          </button>
        </div>
      </div>
    </div>
  );
}
export default memo(CheckInModal);
