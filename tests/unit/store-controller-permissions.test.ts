import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_PERMISSIONS, TENANT_PERMISSIONS, type TenantPermission } from "@/lib/auth/permissions";

describe("store controller default permissions", () => {
  const stores = DEFAULT_TENANT_PERMISSIONS.STORE_CONTROLLER;
  const has = (permission: TenantPermission) => stores.has(permission);

  it("can use Stock Levels: check, receive, issue, transfer, adjust, plus add/edit parts", () => {
    for (const permission of ["INVENTORY_VIEW", "INVENTORY_RECEIVE", "INVENTORY_ISSUE", "INVENTORY_TRANSFER", "INVENTORY_ADJUST", "PARTS_VIEW", "PARTS_CREATE", "PARTS_EDIT"] as const) {
      expect(has(permission)).toBe(true);
    }
  });
  it("can open Manufacturers and Storage Locations (bin locations), add and edit them", () => {
    for (const permission of ["MANUFACTURERS_VIEW", "MANUFACTURERS_CREATE", "MANUFACTURERS_EDIT", "STORAGE_LOCATIONS_VIEW", "STORAGE_LOCATIONS_CREATE", "STORAGE_LOCATIONS_EDIT"] as const) {
      expect(has(permission)).toBe(true);
    }
  });
  it("can see PEX Stock and PEX Tracking but not change them", () => {
    for (const permission of ["PEX_VIEW", "PEX_STOCK_VIEW", "PEX_TRACKING_VIEW"] as const) expect(has(permission)).toBe(true);
    for (const permission of ["PEX_CREATE", "PEX_EDIT", "PEX_STOCK_EDIT", "PEX_STOCK_TRANSFER_IN", "PEX_STOCK_SCRAP", "PEX_SUPPLY_CREATE"] as const) expect(has(permission)).toBe(false);
  });
  it("has nothing outside Stock Levels, Pick slips and PEX Inventory", () => {
    for (const permission of ["DASHBOARD_VIEW", "JOBS_VIEW", "JOBS_EDIT", "JOB_KITS_VIEW", "REPORTS_VIEW", "CUSTOMERS_VIEW", "SUPPLIERS_VIEW", "QUOTES_VIEW", "SALES_ORDERS_VIEW", "INVOICES_VIEW", "USERS_MANAGE", "SETTINGS_MANAGE", "AUDIT_VIEW"] as const) {
      expect(has(permission)).toBe(false);
    }
  });
  it("cannot deactivate parts, manufacturers or bins", () => {
    for (const permission of ["PARTS_DEACTIVATE", "MANUFACTURERS_DEACTIVATE", "STORAGE_LOCATIONS_DEACTIVATE"] as const) expect(has(permission)).toBe(false);
  });
  it("other roles are unchanged: a mechanic user still has no manufacturers or storage locations", () => {
    expect(DEFAULT_TENANT_PERMISSIONS.USER.has("MANUFACTURERS_VIEW")).toBe(false);
    expect(DEFAULT_TENANT_PERMISSIONS.USER.has("STORAGE_LOCATIONS_VIEW")).toBe(false);
  });
});

describe("manager default permissions", () => {
  const manager = DEFAULT_TENANT_PERMISSIONS.MANAGER;
  it("can view and edit every area, including the screens a Manager used to miss", () => {
    for (const permission of ["DASHBOARD_VIEW", "JOBS_EDIT", "JOB_KITS_EDIT", "INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_RECEIVE", "PARTS_EDIT", "MANUFACTURERS_VIEW", "MANUFACTURERS_EDIT", "STORAGE_LOCATIONS_VIEW", "STORAGE_LOCATIONS_EDIT", "PEX_STOCK_VIEW", "PEX_TRACKING_VIEW", "QUOTES_EDIT_DRAFT", "SALES_ORDERS_VIEW", "INVOICES_VIEW", "REPORTS_VIEW", "CUSTOMERS_EDIT", "SUPPLIERS_EDIT"] as const) {
      expect(manager.has(permission)).toBe(true);
    }
  });
  it("has nothing from the Settings menu", () => {
    for (const permission of ["SETTINGS_MANAGE", "USERS_MANAGE", "COMPANY_SETTINGS_VIEW", "COMPANY_SETTINGS_EDIT", "NUMBERING_VIEW", "NUMBERING_EDIT", "TAX_CODES_VIEW", "TAX_CODES_EDIT", "COMMERCIAL_TERMS_VIEW", "COMMERCIAL_TERMS_EDIT"] as const) {
      expect(manager.has(permission)).toBe(false);
    }
  });
  it("does not deactivate or delete records (company admins only), apart from branch/contact/address deactivations it already had", () => {
    for (const permission of ["CUSTOMERS_DEACTIVATE", "SUPPLIERS_DEACTIVATE", "PARTS_DEACTIVATE", "MANUFACTURERS_DEACTIVATE", "STORAGE_LOCATIONS_DEACTIVATE", "JOBS_DELETE"] as const) expect(manager.has(permission)).toBe(false);
    for (const permission of ["CUSTOMER_BRANCH_DEACTIVATE", "CUSTOMER_CONTACT_DEACTIVATE", "SUPPLIER_ADDRESS_DEACTIVATE"] as const) expect(manager.has(permission)).toBe(true);
  });
  it("company admin still holds every permission", () => {
    for (const permission of TENANT_PERMISSIONS) expect(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.has(permission)).toBe(true);
  });
});
