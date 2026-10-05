import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import RequirePermission from "../components/RequirePermission.jsx";
import usePermission from "../hooks/usePermission.js";
import MainLayout from "../layouts/MainLayout.jsx";
import { PERMISSIONS } from "../utils/permissions.js";

const CompaniesPage = lazy(() => import("../pages/CompaniesPage.jsx"));
const CompanyDetailPage = lazy(() => import("../pages/CompanyDetailPage.jsx"));
const AppSettingsPage = lazy(() => import("../pages/AppSettingsPage.jsx"));
const CompanyFormPage = lazy(() => import("../pages/CompanyFormPage.jsx"));
const ContactDetailPage = lazy(() => import("../pages/ContactDetailPage.jsx"));
const ContactNewPage = lazy(() => import("../pages/ContactNewPage.jsx"));
const ContactsPage = lazy(() => import("../pages/ContactsPage.jsx"));
const CustomerDetailPage = lazy(
  () => import("../pages/CustomerDetailPage.jsx"),
);
const CustomersPage = lazy(() => import("../pages/CustomersPage.jsx"));
const HomePage = lazy(() => import("../pages/HomePage.jsx"));
const DashboardPage = lazy(() => import("../pages/DashboardPage.jsx"));

// The first screen: the dashboard for those who may see it, the plain
// welcome page for everyone else.
function Landing() {
  const { can } = usePermission();
  return can(PERMISSIONS.DASHBOARD_READ) ? <DashboardPage /> : <HomePage />;
}
const DocumentViewerPage = lazy(() => import("../features/documents/pages/DocumentViewerPage.jsx"));
const DocumentEditorPage = lazy(() => import("../features/documents/pages/DocumentEditorPage.jsx"));
const ConvertToExcelPage = lazy(() => import("../features/documents/pages/ConvertToExcelPage.jsx"));
const ConvertToPdfPage = lazy(() => import("../features/documents/pages/ConvertToPdfPage.jsx"));
const QuotationPdfEditorPage = lazy(() => import("../features/documents/pages/QuotationPdfEditorPage.jsx"));
const LeadDetailPage = lazy(() => import("../pages/LeadDetailPage.jsx"));
const LeadFormPage = lazy(() => import("../pages/LeadFormPage.jsx"));
const LeadSettingsPage = lazy(() => import("../pages/LeadSettingsPage.jsx"));
const LeadsPage = lazy(() => import("../pages/LeadsPage.jsx"));
const LoginPage = lazy(() => import("../pages/LoginPage.jsx"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage.jsx"));
const OpportunitiesPage = lazy(() => import("../pages/OpportunitiesPage.jsx"));
const OpportunityDetailPage = lazy(
  () => import("../pages/OpportunityDetailPage.jsx"),
);
const OpportunityFormPage = lazy(
  () => import("../pages/OpportunityFormPage.jsx"),
);
const OrderDetailPage = lazy(() => import("../pages/OrderDetailPage.jsx"));
const OrdersPage = lazy(() => import("../pages/OrdersPage.jsx"));
const PermissionsPage = lazy(() => import("../pages/PermissionsPage.jsx"));
const PipelinesPage = lazy(() => import("../pages/PipelinesPage.jsx"));
const ProductDetailPage = lazy(() => import("../pages/ProductDetailPage.jsx"));
const ProductFormPage = lazy(() => import("../pages/ProductFormPage.jsx"));
const ProductsPage = lazy(() => import("../pages/ProductsPage.jsx"));
const ProjectDetailPage = lazy(() => import("../pages/ProjectDetailPage.jsx"));
const ProjectsPage = lazy(() => import("../pages/ProjectsPage.jsx"));
const TicketDetailPage = lazy(() => import("../pages/TicketDetailPage.jsx"));
const TicketsPage = lazy(() => import("../pages/TicketsPage.jsx"));
const ContractDetailPage = lazy(() => import("../pages/ContractDetailPage.jsx"));
const ContractsPage = lazy(() => import("../pages/ContractsPage.jsx"));
const PaymentDetailPage = lazy(() => import("../pages/PaymentDetailPage.jsx"));
const PaymentsPage = lazy(() => import("../pages/PaymentsPage.jsx"));
const DocumentsPage = lazy(() => import("../pages/DocumentsPage.jsx"));
const ReportsPage = lazy(() => import("../pages/ReportsPage.jsx"));
const AuditLogsPage = lazy(() => import("../pages/AuditLogsPage.jsx"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage.jsx"));
const QuotationDetailPage = lazy(
  () => import("../pages/QuotationDetailPage.jsx"),
);
const QuotationFormPage = lazy(() => import("../pages/QuotationFormPage.jsx"));
const QuotationsPage = lazy(() => import("../pages/QuotationsPage.jsx"));
const RoleDetailPage = lazy(() => import("../pages/RoleDetailPage.jsx"));
const RolesPage = lazy(() => import("../pages/RolesPage.jsx"));
const UserDetailPage = lazy(() => import("../pages/UserDetailPage.jsx"));
const UsersPage = lazy(() => import("../pages/UsersPage.jsx"));

// One file holds the three catalogue list pages.
const catalogPage = (name) =>
  lazy(() =>
    import("../pages/CatalogListPage.jsx").then((module) => ({
      default: module[name],
    })),
  );
const CategoriesPage = catalogPage("CategoriesPage");
const UnitsPage = catalogPage("UnitsPage");
const TaxesPage = catalogPage("TaxesPage");

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Everything below requires a signed-in user. */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Landing />} />
            {/* Every signed-in user has notifications; no permission is involved. */}
            <Route path="/notifications" element={<NotificationsPage />} />

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.CUSTOMERS_READ} />
              }
            >
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
            </Route>

            {/* Static paths first: "new" must not be read as a company id. */}
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.COMPANIES_CREATE} />
              }
            >
              <Route path="/companies/new" element={<CompanyFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.COMPANIES_READ,
                    PERMISSIONS.COMPANIES_UPDATE,
                  ]}
                />
              }
            >
              <Route path="/companies/:id/edit" element={<CompanyFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.COMPANIES_READ} />
              }
            >
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/companies/:id" element={<CompanyDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.CONTACTS_CREATE} />
              }
            >
              <Route path="/contacts/new" element={<ContactNewPage />} />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.CONTACTS_READ} />
              }
            >
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/contacts/:id" element={<ContactDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.LEADS_CREATE} />
              }
            >
              <Route path="/leads/new" element={<LeadFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.LEADS_READ,
                    PERMISSIONS.LEADS_UPDATE,
                  ]}
                />
              }
            >
              <Route path="/leads/:id/edit" element={<LeadFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.LEADS_READ} />
              }
            >
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission
                  permission={PERMISSIONS.OPPORTUNITIES_CREATE}
                />
              }
            >
              <Route
                path="/opportunities/new"
                element={<OpportunityFormPage />}
              />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.OPPORTUNITIES_READ,
                    PERMISSIONS.OPPORTUNITIES_UPDATE,
                  ]}
                />
              }
            >
              <Route
                path="/opportunities/:id/edit"
                element={<OpportunityFormPage />}
              />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={PERMISSIONS.OPPORTUNITIES_READ}
                />
              }
            >
              {/* The Kanban board: one column per stage of the chosen pipeline. */}
              <Route path="/opportunities" element={<OpportunitiesPage />} />
              <Route
                path="/opportunities/:id"
                element={<OpportunityDetailPage />}
              />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PIPELINES_MANAGE} />
              }
            >
              <Route path="/pipelines" element={<PipelinesPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.QUOTATIONS_CREATE} />
              }
            >
              <Route path="/quotations/new" element={<QuotationFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.QUOTATIONS_READ,
                    PERMISSIONS.QUOTATIONS_UPDATE,
                  ]}
                />
              }
            >
              <Route
                path="/quotations/:id/edit"
                element={<QuotationFormPage />}
              />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.QUOTATIONS_READ} />
              }
            >
              <Route path="/quotations" element={<QuotationsPage />} />
              <Route path="/quotations/:id" element={<QuotationDetailPage />} />
            </Route>
            {/* Editing the quotation's PDF and attaching it to the quotation. */}
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.QUOTATIONS_READ,
                    PERMISSIONS.DOCUMENTS_READ,
                    PERMISSIONS.DOCUMENTS_CREATE,
                    PERMISSIONS.DOCUMENTS_UPDATE,
                  ]}
                />
              }
            >
              <Route path="/quotations/:id/edit-pdf" element={<QuotationPdfEditorPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.ORDERS_READ} />
              }
            >
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PROJECTS_READ} />
              }
            >
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.TICKETS_READ} />
              }
            >
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.CONTRACTS_READ} />
              }
            >
              <Route path="/contracts" element={<ContractsPage />} />
              <Route path="/contracts/:id" element={<ContractDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PAYMENTS_READ} />
              }
            >
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/payments/:id" element={<PaymentDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.DOCUMENTS_READ} />
              }
            >
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/documents/:id" element={<DocumentViewerPage />} />
              <Route path="/documents/:id/edit" element={<DocumentEditorPage />} />
              <Route path="/documents/:id/to-excel" element={<ConvertToExcelPage />} />
              <Route path="/documents/:id/to-pdf" element={<ConvertToPdfPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.REPORTS_READ} />
              }
            >
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:key" element={<ReportsPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.AUDIT_READ} />
              }
            >
              <Route path="/audit-logs" element={<AuditLogsPage />} />
            </Route>

            {/* Our own details, printed on quotations. */}
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.SETTINGS_MANAGE} />
              }
            >
              <Route path="/settings/application" element={<AppSettingsPage />} />
              {/* The earlier address of the company details. */}
              <Route path="/settings/company" element={<AppSettingsPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PRODUCTS_CREATE} />
              }
            >
              <Route path="/products/new" element={<ProductFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission
                  permission={[
                    PERMISSIONS.PRODUCTS_READ,
                    PERMISSIONS.PRODUCTS_UPDATE,
                  ]}
                />
              }
            >
              <Route path="/products/:id/edit" element={<ProductFormPage />} />
            </Route>
            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PRODUCTS_READ} />
              }
            >
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Route>

            {/* The lists behind the product form. */}
            <Route
              element={
                <RequirePermission
                  permission={PERMISSIONS.PRODUCTS_MANAGE_CATALOG}
                />
              }
            >
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/units" element={<UnitsPage />} />
              <Route path="/taxes" element={<TaxesPage />} />
            </Route>

            <Route
              element={
                <RequirePermission
                  anyOf={[
                    PERMISSIONS.LEAD_CONFIG_MANAGE,
                    PERMISSIONS.ACTIVITIES_MANAGE_TYPES,
                    PERMISSIONS.QUOTATIONS_MANAGE_STATUSES,
                    PERMISSIONS.ORDERS_MANAGE_STATUSES,
                    PERMISSIONS.PROJECTS_MANAGE_STATUSES,
                    PERMISSIONS.TICKETS_MANAGE_SETTINGS,
                    PERMISSIONS.CONTRACTS_MANAGE_SETTINGS,
                    PERMISSIONS.PAYMENTS_MANAGE_SETTINGS,
                    PERMISSIONS.DOCUMENTS_MANAGE_SETTINGS,
                  ]}
                />
              }
            >
              <Route path="/settings" element={<LeadSettingsPage />} />
              {/* The earlier address of the same screen. */}
              <Route path="/lead-settings" element={<LeadSettingsPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.USERS_READ} />
              }
            >
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.ROLES_READ} />
              }
            >
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/roles/:id" element={<RoleDetailPage />} />
            </Route>

            <Route
              element={
                <RequirePermission permission={PERMISSIONS.PERMISSIONS_READ} />
              }
            >
              <Route path="/permissions" element={<PermissionsPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
