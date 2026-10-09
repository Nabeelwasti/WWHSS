import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type UserSummary, type RoleSummary, type ClassSummary } from "../api";
import { useLanguage } from "../i18n";
import { StudentDirectorySection } from "../components/StudentDirectorySection";
import { FinanceManagementSection } from "../components/FinanceManagementSection";
import { AiAssessmentStudioSection } from "../components/AiAssessmentStudioSection";
import { DocumentEngineSection } from "../components/DocumentEngineSection";
import { CmsManagementSection } from "../components/CmsManagementSection";
import { BackupManagementSection } from "../components/BackupManagementSection";
import { LibraryManagementSection } from "../components/LibraryManagementSection";
import { StaffManagementSection } from "../components/StaffManagementSection";
import { EnterpriseOperationsSection } from "../components/EnterpriseOperationsSection";

export type AdminTab = "users" | "staff" | "students" | "finance" | "library" | "assessment" | "documents" | "cms" | "backups" | "operations";

export function AdminPage({ initialTab = "users" }: { initialTab?: AdminTab }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; label: string; startDate: string; endDate: string; isActive: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setTab(initialTab), [initialTab]);

undefined