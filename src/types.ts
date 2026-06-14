
export interface Cable {
  id: string;
  name: string;
  size?: string; // e.g., "16mmq"
  type: 'power' | 'data' | 'evac' | 'irai';
  diameter: number; // in mm
  weight?: number; // kg/km
  indice?: number;
  INDICE?: number;
  isFavorite?: boolean;
}

export interface Structure {
  id: string;
  name?: string;
  type: 'tray' | 'conduit';
  width: number; // mm
  height: number; // mm
  fillLimit: number; // percentage (e.g., 40, 50)
  hasSeparator?: boolean;
  spareTubes?: number;
}

export interface StandardStructure {
  id: string;
  name: string;
  type: 'tray' | 'conduit';
  width: number;
  height: number;
  fillLimit: number;
  isFavorite?: boolean;
}

export interface ProjectCable {
  id: string;
  cable: Cable;
  quantity: number;
  tag?: string;
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  structure: Structure;
  projectCables: ProjectCable[];
  lastSaved?: string;
  notes?: string;
}

// ─── Topology Editor ─────────────────────────────────────────────────────────

export type TopologyNodeType = 'source' | 'junction' | 'terminal';

export interface TopologyNode {
  id: string;
  type: TopologyNodeType;
  label: string;
  position: { x: number; y: number };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: string; // circuit name, e.g. "C1"
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

/** One cable run extracted from the topology — becomes a Structure in the project */
export interface TopologyCircuit {
  id: string;          // e.g. "C1"
  from: string;        // label of source node
  to: string;          // label of target node
  /** Populated after AI parsing of unifilar or manual entry */
  cables?: TopologyCableSpec[];
}

export interface TopologyCableSpec {
  name: string;        // e.g. "FG7OR"
  type: 'power' | 'data' | 'evac' | 'irai';
  section: string;     // e.g. "2.5"  (mm²)
  conductors: number;  // number of conductors per cable
  quantity: number;    // number of cables of this type in this run
  diameter?: number;   // mm — calculated or provided
  construction: 'unipolar' | 'multipolar';
}

/** Settings provided by user before project generation */
export interface TopologyProjectConfig {
  structureType: 'tray' | 'conduit';
  fillLimit: number;           // e.g. 40 (%)
  fixedDimension: { width: number; height: number } | null; // null = auto
  spareTubes: number;
  hasSeparator: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  details?: string[];
}

export interface MaterialItem {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  description: string;
  technicalSpecs: Record<string, string>;
  image?: string;
  documents?: { name: string; url: string; version: string; date: string }[];
}

export interface MaterialCategory {
  id: string;
  name: string;
  icon: string;
}

export interface Translation {
  title: string;
  nav: {
    dashboard: string;
    trays: string;
    conduits: string;
    cables: string;
    admin: string;
    users: string;
    newProject: string;
  };
  sidebar: {
    overview: string;
    cableTrays: string;
    conduits: string;
    cables: string;
    database: string;
    vault: string;
    documentation: string;
    projectManagement: string;
    appSubtitle: string;
    userTitle: string;
  };
  header: {
    currentModule: string;
    searchPlaceholder: string;
    lightMode: string;
    darkMode: string;
    export: string;
    exportPdf: string;
    exportCsv: string;
    generatingPdf: string;
  };
  input: {
    parameters: string;
    structureName: string;
    structureType: string;
    dimensions: string;
    fillLimit: string;
    addCable: string;
    calculate: string;
    width: string;
    height: string;
    quantity: string;
    standardSize: string;
    customSize: string;
    diameter: string;
    size: string;
    tagPlaceholder: string;
    editTag: string;
    hasSeparator: string;
    spareTubes: string;
    mixedSystemsWarning: string;
    conduitMixedWarning: string;
    separatorRequiredWarning: string;
    clearAll: string;
    cableAdded: string;
    cableRemoved: string;
    allCablesRemoved: string;
    searchCables: string;
    favorites: string;
    notes: string;
    notesPlaceholder: string;
  };
  results: {
    utilization: string;
    status: string;
    pass: string;
    fail: string;
    totalArea: string;
    usedArea: string;
    numberOfTrays: string;
    autoScaled: string;
    deltaMax: string;
    allow: string;
  };
  preview: {
    structuralPreview: string;
    crossSection: string;
    cableSchedule: string;
    noTag: string;
    noCables: string;
    noSavedProjects: string;
    structure: string;
    limit: string;
    utilization: string;
    reset: string;
    newProject: string;
    deleteProject: string;
    project: string;
    saveProject: string;
    savedProjects: string;
    loadProject: string;
    lastSaved: string;
    mustBeLoggedIn: string;
    saveError: string;
    unexpectedError: string;
    pdfExportError: string;
    zoomIn: string;
    zoomOut: string;
    fitToScreen: string;
    shortcuts: string;
    dashboard: string;
  };
  management: {
    addNew: string;
    name: string;
    width: string;
    height: string;
    diameter: string;
    weight: string;
    type: string;
    category: string;
    power: string;
    specialSystems: string;
    actions: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    existingModels: string;
    existingCables: string;
    saveSuccess?: string;
    deleteSuccess?: string;
    confirmDelete?: string;
  };
  auth: {
    login: string;
    register: string;
    username: string;
    password: string;
    signIn: string;
    signUp: string;
    needAccount: string;
    haveAccount: string;
    adminPanel: string;
    logout: string;
    pendingApproval: string;
    connectionError: string;
    email: string;
    name: string;
    systemName: string;
    passwordRequired: string;
  };
  userManagement: {
    title: string;
    users: string;
    approve: string;
    delete: string;
    status: string;
    approved: string;
    pending: string;
    role: string;
    confirmDelete: string;
    createError: string;
    fetchError: string;
    approveError: string;
    updateError: string;
    deleteError: string;
    unknownError: string;
    userCreated: string;
    userApproved: string;
    userDeleted: string;
    changesSaved: string;
    newUser: string;
    searchPlaceholder: string;
    allRoles: string;
    createNewUser: string;
    nameLabel: string;
    emailLabel: string;
    passwordLabel: string;
    passwordRequired: string;
    accessLevel: string;
    accessibleModules: string;
    cancel: string;
    creating: string;
    createUser: string;
    nameHeader: string;
    emailHeader: string;
    levelHeader: string;
    modulesHeader: string;
    statusHeader: string;
    actionsHeader: string;
    noUsersFound: string;
    adjustFilters: string;
    dbColumns: string;
    masterAdminDeleteError: string;
    adminRole: string;
    userRole: string;
    cableFillPro: string;
  };
  report: {
    title: string;
    crossSection: string;
    scale: string;
    parameters: string;
    totalArea: string;
    usedArea: string;
    reserveFactor: string;
    formula: string;
    finalResult: string;
    occupancyRate: string;
    approved: string;
    rejected: string;
    cableManifest: string;
    total: string;
    units: string;
    specification: string;
    dimension: string;
    tag: string;
    qty: string;
    printPDF: string;
    projectId: string;
    client: string;
    engineer: string;
    emissionDate: string;
    digitalSignature: string;
    verificationHash: string;
    generatedAt: string;
  };
  misc: {
    techNotes: string;
    occupancyDist: string;
    keyboardShortcuts: string;
    increaseProductivity: string;
    reportPreview: string;
    widthShort: string;
    heightShort: string;
    addCablesPrompt: string;
    understood: string;
    saveProjectShortcut: string;
    newProjectShortcut: string;
    closeModalsShortcut: string;
  };
  cableTypes: {
    power: string;
    data: string;
    evac: string;
    irai: string;
  };
}

