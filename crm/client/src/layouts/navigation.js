import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import { PERMISSIONS } from '../utils/permissions.js';

const P = PERMISSIONS;

// The navigation: groups of entries. An entry with `permission` / `anyOf` is
// shown only to users who hold it (same semantics as <PermissionGate>); one
// without either is shown to every signed-in user. A group with nothing the
// user may see is not shown at all. Labels are i18n keys. Add modules here -
// the sidebar, the search box's "Go to" list and the breadcrumbs all read this.
export const NAV_GROUPS = [
  {
    id: 'home',
    items: [{ id: 'dashboard', labelKey: 'nav.dashboard', to: '/', icon: DashboardOutlinedIcon, end: true }],
  },
  {
    id: 'sales',
    labelKey: 'navGroups.sales',
    items: [
      { id: 'leads', labelKey: 'nav.leads', to: '/leads', icon: TrackChangesOutlinedIcon, permission: P.LEADS_READ },
      { id: 'opportunities', labelKey: 'nav.opportunities', to: '/opportunities', icon: ViewKanbanOutlinedIcon, permission: P.OPPORTUNITIES_READ },
      { id: 'pipelines', labelKey: 'nav.pipelines', to: '/pipelines', icon: AccountTreeOutlinedIcon, permission: P.PIPELINES_MANAGE },
      { id: 'quotations', labelKey: 'nav.quotations', to: '/quotations', icon: RequestQuoteOutlinedIcon, permission: P.QUOTATIONS_READ },
      { id: 'orders', labelKey: 'nav.orders', to: '/orders', icon: ShoppingCartOutlinedIcon, permission: P.ORDERS_READ },
    ],
  },
  {
    id: 'customers',
    labelKey: 'navGroups.customers',
    items: [
      { id: 'companies', labelKey: 'nav.companies', to: '/companies', icon: BusinessOutlinedIcon, permission: P.COMPANIES_READ },
      { id: 'contacts', labelKey: 'nav.contacts', to: '/contacts', icon: ContactsOutlinedIcon, permission: P.CONTACTS_READ },
      { id: 'customers', labelKey: 'nav.customers', to: '/customers', icon: HandshakeOutlinedIcon, permission: P.CUSTOMERS_READ },
    ],
  },
  {
    id: 'operations',
    labelKey: 'navGroups.operations',
    items: [
      { id: 'projects', labelKey: 'nav.projects', to: '/projects', icon: AssignmentOutlinedIcon, permission: P.PROJECTS_READ },
      { id: 'tickets', labelKey: 'nav.tickets', to: '/tickets', icon: SupportAgentOutlinedIcon, permission: P.TICKETS_READ },
      { id: 'contracts', labelKey: 'nav.contracts', to: '/contracts', icon: GavelOutlinedIcon, permission: P.CONTRACTS_READ },
      { id: 'documents', labelKey: 'nav.documents', to: '/documents', icon: FolderOutlinedIcon, permission: P.DOCUMENTS_READ },
    ],
  },
  {
    id: 'finance',
    labelKey: 'navGroups.finance',
    items: [{ id: 'payments', labelKey: 'nav.payments', to: '/payments', icon: PaymentsOutlinedIcon, permission: P.PAYMENTS_READ }],
  },
  {
    id: 'catalogue',
    labelKey: 'navGroups.catalogue',
    items: [
      { id: 'products', labelKey: 'nav.products', to: '/products', icon: Inventory2OutlinedIcon, permission: P.PRODUCTS_READ },
      { id: 'categories', labelKey: 'nav.categories', to: '/categories', icon: CategoryOutlinedIcon, permission: P.PRODUCTS_MANAGE_CATALOG },
      { id: 'units', labelKey: 'nav.units', to: '/units', icon: StraightenOutlinedIcon, permission: P.PRODUCTS_MANAGE_CATALOG },
      { id: 'taxes', labelKey: 'nav.taxes', to: '/taxes', icon: PercentOutlinedIcon, permission: P.PRODUCTS_MANAGE_CATALOG },
    ],
  },
  {
    id: 'insights',
    labelKey: 'navGroups.insights',
    items: [{ id: 'reports', labelKey: 'nav.reports', to: '/reports', icon: AssessmentOutlinedIcon, permission: P.REPORTS_READ }],
  },
  {
    id: 'administration',
    labelKey: 'navGroups.administration',
    items: [
      { id: 'users', labelKey: 'nav.users', to: '/users', icon: PeopleOutlinedIcon, permission: P.USERS_READ },
      { id: 'roles', labelKey: 'nav.roles', to: '/roles', icon: AdminPanelSettingsOutlinedIcon, permission: P.ROLES_READ },
      { id: 'permissions', labelKey: 'nav.permissions', to: '/permissions', icon: VpnKeyOutlinedIcon, permission: P.PERMISSIONS_READ },
      {
        id: 'lists',
        labelKey: 'nav.lists',
        to: '/settings',
        end: true,
        icon: TuneOutlinedIcon,
        anyOf: [
          P.LEAD_CONFIG_MANAGE,
          P.ACTIVITIES_MANAGE_TYPES,
          P.QUOTATIONS_MANAGE_STATUSES,
          P.ORDERS_MANAGE_STATUSES,
          P.PROJECTS_MANAGE_STATUSES,
          P.TICKETS_MANAGE_SETTINGS,
          P.CONTRACTS_MANAGE_SETTINGS,
          P.PAYMENTS_MANAGE_SETTINGS,
        ],
      },
      { id: 'applicationSettings', labelKey: 'nav.applicationSettings', to: '/settings/application', icon: StorefrontOutlinedIcon, permission: P.SETTINGS_MANAGE },
      { id: 'auditLog', labelKey: 'nav.auditLog', to: '/audit-logs', icon: HistoryOutlinedIcon, permission: P.AUDIT_READ },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

// What "+ Create" offers. Each needs its permission; those the user lacks are
// not shown.
export const CREATE_ITEMS = [
  { id: 'lead', labelKey: 'quickCreate.lead', commandKey: 'quickCreate.newLead', to: '/leads/new', icon: TrackChangesOutlinedIcon, permission: P.LEADS_CREATE },
  { id: 'company', labelKey: 'quickCreate.company', commandKey: 'quickCreate.newCompany', to: '/companies/new', icon: BusinessOutlinedIcon, permission: P.COMPANIES_CREATE },
  { id: 'contact', labelKey: 'quickCreate.contact', commandKey: 'quickCreate.newContact', to: '/contacts/new', icon: ContactsOutlinedIcon, permission: P.CONTACTS_CREATE },
  { id: 'opportunity', labelKey: 'quickCreate.opportunity', commandKey: 'quickCreate.newOpportunity', to: '/opportunities/new', icon: ViewKanbanOutlinedIcon, permission: P.OPPORTUNITIES_CREATE },
  { id: 'quotation', labelKey: 'quickCreate.quotation', commandKey: 'quickCreate.newQuotation', to: '/quotations/new', icon: RequestQuoteOutlinedIcon, permission: P.QUOTATIONS_CREATE },
  { id: 'product', labelKey: 'quickCreate.product', commandKey: 'quickCreate.newProduct', to: '/products/new', icon: Inventory2OutlinedIcon, permission: P.PRODUCTS_CREATE },
];
