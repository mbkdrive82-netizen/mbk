import BadgeCheck from "lucide-react/dist/esm/icons/badge-check";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import Building2 from "lucide-react/dist/esm/icons/building-2";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import CreditCard from "lucide-react/dist/esm/icons/credit-card";
import FileText from "lucide-react/dist/esm/icons/file-text";
import GraduationCap from "lucide-react/dist/esm/icons/graduation-cap";
import HandCoins from "lucide-react/dist/esm/icons/hand-coins";
import Home from "lucide-react/dist/esm/icons/home";
import Image from "lucide-react/dist/esm/icons/image";
import MapPin from "lucide-react/dist/esm/icons/map-pin";

import MessageSquareMore from "lucide-react/dist/esm/icons/message-square-more";
import Receipt from "lucide-react/dist/esm/icons/receipt";
import Settings from "lucide-react/dist/esm/icons/settings";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import UserCheck from "lucide-react/dist/esm/icons/user-check";
import UserCog from "lucide-react/dist/esm/icons/user-cog";
import Users from "lucide-react/dist/esm/icons/users";


export const roleLinks = {
  SuperAdmin: [
    { label: "Dashboard",         href: "/dashboard",                    icon: Home },
    { label: "Companies",         href: "/dashboard/companies",          icon: Building2 },
    { label: "Colleges",          href: "/dashboard/colleges",           icon: GraduationCap },
    { label: "Courses",           href: "/dashboard/courses",            icon: FileText },
    { label: "Trainers",          href: "/dashboard/trainers",           icon: Users },
    { label: "Approvals",         href: "/dashboard/approvals",          icon: UserCheck },
    { label: "Verify Documents",  href: "/dashboard/documents",          icon: BadgeCheck },
    { label: "Trainer Activity",  href: "/dashboard/trainer-activity",   icon: Clock3 },
    { label: "Overall Attendance",href: "/dashboard/attendance",         icon: CalendarClock },
    { label: "City Management",   href: "/dashboard/cities",             icon: MapPin },
    { label: "Salary Management", href: "/dashboard/salary",             icon: HandCoins },
    { label: "Complaints",        href: "/dashboard/complaints",         icon: MessageSquareMore },
    { label: "NDA",               href: "/dashboard/nda",                icon: ShieldCheck },
    { label: "User Accounts",     href: "/dashboard/accounts",           icon: UserCog },
  ],

  SPOCAdmin: [
    { label: "Dashboard",         href: "/spoc/dashboard",               icon: Home },
    { label: "Scheduler",         href: "/spoc/schedule",                icon: CalendarClock },
    { label: "Trainers",          href: "/spoc/trainers",                icon: Users },
    { label: "Check-In Verify",   href: "/spoc/attendance",              icon: BadgeCheck },
    { label: "Check-Out Status",  href: "/spoc/geo-verification",        icon: MapPin },
    { label: "Overall Attendance",href: "/spoc/overall-attendance",      icon: Clock3 },
    { label: "Colleges",          href: "/spoc/colleges",                icon: GraduationCap },
    { label: "Courses",           href: "/spoc/courses",                 icon: FileText },
    { label: "Analytics",         href: "/spoc/analytics",               icon: BarChart3 },
  ],

  CollegeAdmin: [
    { label: "Dashboard",         href: "/spoc/dashboard",               icon: Home },
    { label: "Scheduler",         href: "/spoc/schedule",                icon: CalendarClock },
    { label: "Trainers",          href: "/spoc/trainers",                icon: Users },
    { label: "Check-In Verify",   href: "/spoc/attendance",              icon: BadgeCheck },
    { label: "Check-Out Status",  href: "/spoc/geo-verification",        icon: MapPin },
    { label: "Overall Attendance",href: "/spoc/overall-attendance",      icon: Clock3 },
    { label: "Colleges",          href: "/spoc/colleges",                icon: GraduationCap },
    { label: "Analytics",         href: "/spoc/analytics",               icon: BarChart3 },
  ],

  Trainer: [
    { label: "Dashboard",                  href: "/trainer/dashboard",             icon: Home },
    { label: "Attendance Upload",          href: "/trainer/attendance",            icon: ClipboardList },
    { label: "Student Activities",         href: "/trainer/student-activities",    icon: Image },
    { label: "Student Attendance Records", href: "/trainer/student-attendance",    icon: FileText },
    { label: "Reports",                    href: "/trainer/reports",               icon: BarChart3 },
    { label: "Profile Settings",           href: "/trainer/settings",              icon: Settings },
  ],

  Accountant: [
    { label: "Dashboard",         href: "/accountant/dashboard",         icon: Home },
    { label: "Salary Review",     href: "/accountant/salary",            icon: HandCoins },
    { label: "Payslips",          href: "/accountant/payslips",          icon: Receipt },
    { label: "Financial Reports", href: "/accountant/reports",           icon: BarChart3 },
    { label: "Statements",        href: "/accountant/statements",        icon: FileText },
    { label: "Bank Details",      href: "/accountant/bank-details",      icon: CreditCard },
    { label: "Settings",          href: "/accountant/settings",          icon: Settings },
  ],

  Student: [
    { label: "Dashboard",         href: "/student/dashboard",            icon: Home },
    { label: "Courses",             href: "/student/courses",              icon: BookOpen },
    { label: "Learning Hub",        href: "/lms",                          icon: GraduationCap },
    { label: "Profile",             href: "/student/profile",              icon: UserCog },
  ],

  Company: [
    { label: "Dashboard",         href: "/company/dashboard",            icon: Home },
    { label: "Monitoring",        href: "/company/monitoring",           icon: BadgeCheck },
    { label: "Sessions",          href: "/company/sessions",             icon: CalendarClock },
    { label: "Colleges",          href: "/company/colleges",             icon: GraduationCap },
    { label: "Trainers",          href: "/company/hiring",               icon: Users },
    { label: "Reports",           href: "/company/reports",              icon: BarChart3 },
    { label: "Profile",           href: "/company/profile",              icon: Settings },
  ],
};


export const homeLinksByRole = {
  SuperAdmin:   "/dashboard",
  SPOCAdmin:    "/spoc/dashboard",
  CollegeAdmin: "/spoc/dashboard",
  Trainer:      "/trainer/dashboard",
  Accountant:   "/accountant/dashboard",
  Student:      "/student/dashboard",
  Company:      "/company/dashboard",
};

export const complaintsLinksByRole = {
  SuperAdmin:   "/dashboard/complaints",
  SPOCAdmin:    "/spoc/complaints",
  CollegeAdmin: "/spoc/complaints",
  Trainer:      "/trainer/complaints",
  Accountant:   "/dashboard/complaints",
};

export const resolveSidebarRole = (role = "", pathname = "") => {
  const r = String(role || "").trim().toLowerCase();
  if (r === "superadmin" || r === "admin") return "SuperAdmin";
  if (r === "spocadmin" || r === "spoc") return "SPOCAdmin";
  if (r === "collegeadmin") return "CollegeAdmin";
  if (r === "trainer") return "Trainer";
  if (r === "accountant") return "Accountant";
  if (r === "student") return "Student";
  if (r === "company" || r === "companyadmin") return "Company";
  if (pathname.startsWith("/student")) return "Student";
  if (pathname.startsWith("/company")) return "Company";
  if (pathname.startsWith("/spoc")) return "SPOCAdmin";
  if (pathname.startsWith("/trainer")) return "Trainer";
  if (pathname.startsWith("/accountant")) return "Accountant";
  return "SuperAdmin";
};

export const resolvePortalTitle = (activeRole) => {
  if (activeRole === "SPOCAdmin") return "SPOC Portal";
  if (activeRole === "CollegeAdmin") return "College Portal";
  if (activeRole === "Trainer") return "Trainer Portal";
  if (activeRole === "Accountant") return "Accountant Portal";
  if (activeRole === "Student") return "Student Portal";
  if (activeRole === "Company") return "Company Portal";
  return "Admin Portal";
};

export const resolveNavLinks = ({ activeRole }) =>
  roleLinks[activeRole] || roleLinks.SuperAdmin;

export const sidebarRailIcons = {
  complaints: FileText,
  home: Home,
  logout: MessageSquareMore,
};
