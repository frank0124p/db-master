export const ROLE_IDS = ["admin", "suite_owner", "maintainer", "viewer"] as const;
export type RoleId = typeof ROLE_IDS[number];

export interface RoleDef {
  label: string;
  description: string;
  color: string;
  permissions: {
    approveNaming: boolean;
    rejectNaming: boolean;
    assignReviewers: boolean;
    createNaming: boolean;
    editNaming: boolean;
    deleteNaming: boolean;
    manageUsers: boolean;
  };
}

export const ROLES: Record<RoleId, RoleDef> = {
  admin: {
    label: "最高管理員",
    description: "全域管理員，擁有所有操作權限，包含使用者管理與命名字典最終審核。",
    color: "#fb7185",
    permissions: { approveNaming: true, rejectNaming: true, assignReviewers: true, createNaming: true, editNaming: true, deleteNaming: true, manageUsers: true },
  },
  suite_owner: {
    label: "Suite Owner",
    description: "產品套件負責人，可審核自己套件範圍內的命名詞彙並指派審核人。",
    color: "#f59e0b",
    permissions: { approveNaming: true, rejectNaming: true, assignReviewers: true, createNaming: true, editNaming: true, deleteNaming: false, manageUsers: false },
  },
  maintainer: {
    label: "Maintainer",
    description: "維護者，可新增與編輯詞彙（進入暫存區），無法審核。",
    color: "#38b6f0",
    permissions: { approveNaming: false, rejectNaming: false, assignReviewers: false, createNaming: true, editNaming: true, deleteNaming: false, manageUsers: false },
  },
  viewer: {
    label: "檢視者",
    description: "唯讀，只能瀏覽字典與 Schema，無法新增或修改任何內容。",
    color: "#7b899e",
    permissions: { approveNaming: false, rejectNaming: false, assignReviewers: false, createNaming: false, editNaming: false, deleteNaming: false, manageUsers: false },
  },
};
