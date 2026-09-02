"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Search } from "lucide-react";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from "@/lib/jobs/ui";

type Row = Record<string, unknown> & { id: string };
type CustomerSelection = Row & { name: string; tradingName?: string | null; accountCode?: string | null };
type AllocationSummary = {
  quantityReserved?: unknown;
  quantityIssued?: unknown;
  quantityReturned?: unknown;
  quantityReturnedToOutstanding?: unknown;
  quantityEffectiveFulfilled?: unknown;
};
type RequirementSummary = {
  quantityRequired?: unknown;
  quantityReserved?: unknown;
  grossIssued?: unknown;
  grossReturned?: unknown;
  returnedReopeningRequirement?: unknown;
  effectiveFulfilled?: unknown;
  outstanding?: unknown;
};
type AllocationRow = Row & {
  stockReservationId?: string | null;
  quantityReserved?: unknown;
  location?: Row & { code?: string | null; name?: string | null };
  summary?: AllocationSummary;
};
type StorageLocationOption = Row & { code?: string | null; name?: string | null; type?: string | null; active?: boolean };
type JobKitOption = Row & { name: string; machineMake?: string | null; machineModel?: string | null; componentType?: string | null; lineCount?: unknown; active?: boolean };
type PexStockUnitSummary = Row & {
  component?: string | null;
  componentType?: string | null;
  componentPartNumber?: string | null;
  componentSerial?: string | null;
  status?: string | null;
  sourceJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null };
  storageLocation?: Row & { id: string; code?: string | null; name?: string | null } | null;
  currentSupplyJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null } | null;
  currentReturnJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null } | null;
  sourceJobComponentId?: string | null;
};
type PexSupplyLinkSummary = Row & {
  active?: boolean;
  returnStatus?: string | null;
  expectedCoreDescription?: string | null;
  expectedCoreType?: string | null;
  expectedCorePartNumber?: string | null;
  expectedCoreSerial?: string | null;
  returnedCoreDescription?: string | null;
  returnedCoreType?: string | null;
  returnedCorePartNumber?: string | null;
  returnedCoreSerial?: string | null;
  returnMismatchReason?: string | null;
  returnedReceivedAt?: string | null;
  closedWithoutReturnReason?: string | null;
  pexStockUnit: PexStockUnitSummary;
  returnJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null };
  supplyJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null };
};
type JobComponentRow = Row & { component?: string | null; componentType?: string | null; componentPartNumber?: string | null; componentSerial?: string | null };
type RequirementRow = Row & {
  active?: boolean;
  quantityRequired?: unknown;
  part: Row & { partNumber?: string | null; description?: string | null; unitOfMeasure?: string | null };
  allocations: AllocationRow[];
  summary?: RequirementSummary;
};
type JobDetail = Row & {
  jobNumber?: string | null;
  draftNumber: string;
  status: keyof typeof JOB_STATUS_LABELS;
  type: keyof typeof JOB_TYPE_LABELS;
  customerId: string;
  customer: CustomerSelection & { contacts?: Row[]; addresses?: Row[]; branches?: Row[] };
  notes: Array<Row & { createdBy?: { displayName?: string | null } | null }>;
  activities: Array<Row & { actor?: { displayName?: string | null } | null }>;
  fieldServiceReport?: Row | null;
  warranty?: Row | null;
  components: JobComponentRow[];
  pexSourceStockUnits: PexStockUnitSummary[];
  pexSupplyLinksAsSupply: PexSupplyLinkSummary[];
  pexSupplyLinksAsReturn: PexSupplyLinkSummary[];
  partRequirements: RequirementRow[];
};

const JOB_TYPES = Object.entries(JOB_TYPE_LABELS);
const REGISTERABLE_STATUSES = ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE"];
const CHANGEABLE_STATUSES = ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE", "CANCELLED"];

function text(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function decimalText(value: unknown) {
  if (value == null || value === "") return "0";
  return String(value);
}

export function JobWorkspace({ mode, jobId }: { mode: "create" | "detail"; jobId?: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(mode === "detail");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<CustomerSelection[]>([]);
  const [showCustomerOptions, setShowCustomerOptions] = useState(false);
  const [partQuery, setPartQuery] = useState("");
  const [partOptions, setPartOptions] = useState<Row[]>([]);
  const [partId, setPartId] = useState("");
  const [reserveRequirementId, setReserveRequirementId] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationOptions, setLocationOptions] = useState<StorageLocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocationOption | null>(null);
  const [jobKitQuery, setJobKitQuery] = useState("");
  const [jobKitOptions, setJobKitOptions] = useState<JobKitOption[]>([]);
  const [jobKitId, setJobKitId] = useState("");
  const [pexLocationQuery, setPexLocationQuery] = useState("");
  const [pexLocationOptions, setPexLocationOptions] = useState<StorageLocationOption[]>([]);
  const [selectedPexLocation, setSelectedPexLocation] = useState<StorageLocationOption | null>(null);
  const [pexSupplyQuery, setPexSupplyQuery] = useState("");
  const [pexSupplyOptions, setPexSupplyOptions] = useState<PexStockUnitSummary[]>([]);
  const [selectedPexUnitId, setSelectedPexUnitId] = useState("");

  const [form, setForm] = useState<Record<string, string>>({
    customerId: "",
    customerReference: "",
    customerPo: "",
    machineModel: "",
    machineSerial: "",
    component: "",
    componentType: "",
    componentSerial: "",
    componentPartNumber: "",
    description: "",
    type: "STANDARD_REPAIR",
    etaDate: "",
    relationshipNotes: "",
    registerStatus: "TO_BE_RECEIVED",
    changeStatus: "TO_BE_RECEIVED",
    statusReason: "",
    closingOutcome: "",
    closingNote: "",
    reopenStatus: "TO_BE_RECEIVED",
    reopenReason: "",
    note: "",
    fieldSite: "",
    fieldTechnician: "",
    fieldVehicle: "",
    fieldHours: "",
    fieldReport: "",
    warrantyStatus: "PENDING",
    warrantyNotes: "",
    warrantyHistorical: "",
    partQty: "1",
    partNotes: "",
    partEtaDate: "",
    pexMismatchReason: "",
    pexCloseReason: "",
    pexCloseNote: "",
    pexReturnedCoreDescription: "",
    pexReturnedCoreType: "",
    pexReturnedCorePartNumber: "",
    pexReturnedCoreSerial: "",
    pexCorrectionReason: "",
  });

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load job.");
      setJob(body);
      setForm((current) => ({
        ...current,
        customerId: body.customerId || "",
        customerReference: body.customerReference || "",
        customerPo: body.customerPo || "",
        machineModel: body.machineModel || "",
        machineSerial: body.machineSerial || "",
        component: body.component || "",
        componentType: body.componentType || "",
        componentSerial: body.componentSerial || "",
        componentPartNumber: body.componentPartNumber || "",
        description: body.description || "",
        type: body.type || "STANDARD_REPAIR",
        etaDate: body.etaDate ? String(body.etaDate).slice(0, 10) : "",
        relationshipNotes: body.relationshipNotes || "",
        changeStatus: body.status,
        registerStatus: body.status === "DRAFT" ? "TO_BE_RECEIVED" : body.status,
        reopenStatus: "TO_BE_RECEIVED",
        fieldSite: body.fieldServiceReport?.site ? String(body.fieldServiceReport.site) : "",
        fieldTechnician: body.fieldServiceReport?.technician ? String(body.fieldServiceReport.technician) : "",
        fieldVehicle: body.fieldServiceReport?.vehicle ? String(body.fieldServiceReport.vehicle) : "",
        fieldHours: body.fieldServiceReport?.hours ? String(body.fieldServiceReport.hours) : "",
        fieldReport: body.fieldServiceReport?.report ? String(body.fieldServiceReport.report) : "",
        warrantyStatus: body.warranty?.status ? String(body.warranty.status) : "PENDING",
        warrantyNotes: body.warranty?.notes ? String(body.warranty.notes) : "",
        warrantyHistorical: body.warranty?.historicalSourceStatus ? String(body.warranty.historicalSourceStatus) : "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  /* eslint-disable react-hooks/set-state-in-effect -- async resource loading and search result synchronization are intentional here */
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) { setCustomerOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/selections/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const b = await r.json();
      setCustomerOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    const q = partQuery.trim();
    if (q.length < 2) { setPartOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/parts?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setPartOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [partQuery]);

  useEffect(() => {
    if (!reserveRequirementId) {
      setLocationQuery("");
      setLocationOptions([]);
      setSelectedLocation(null);
      return;
    }
    const q = locationQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/storage-locations?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setLocationOptions((b.items || []).filter((item: StorageLocationOption) => item.active !== false));
    }, 200);
    return () => clearTimeout(timer);
  }, [locationQuery, reserveRequirementId]);

  useEffect(() => {
    if (!jobId) return;
    const q = jobKitQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/job-kits?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setJobKitOptions((b.items || []).filter((item: JobKitOption) => item.active !== false));
    }, 200);
    return () => clearTimeout(timer);
  }, [jobId, jobKitQuery]);

  useEffect(() => {
    const q = pexLocationQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/storage-locations?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setPexLocationOptions((b.items || []).filter((item: StorageLocationOption) => item.active !== false));
    }, 200);
    return () => clearTimeout(timer);
  }, [pexLocationQuery]);

  useEffect(() => {
    if (job?.type !== "PEX_SUPPLY") { setPexSupplyOptions([]); return; }
    const q = pexSupplyQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/pex-stock?status=AVAILABLE&pageSize=20&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const b = await r.json();
      setPexSupplyOptions((b.items || []) as PexStockUnitSummary[]);
    }, 200);
    return () => clearTimeout(timer);
  }, [job?.type, pexSupplyQuery]);

  const title = useMemo(() => job?.jobNumber || job?.draftNumber || "New job", [job]);

  function updateField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = {
        customerId: form.customerId,
        customerReference: form.customerReference || null,
        customerPo: form.customerPo || null,
        machineModel: form.machineModel || null,
        machineSerial: form.machineSerial || null,
        component: form.component || null,
        componentType: form.componentType || null,
        componentSerial: form.componentSerial || null,
        componentPartNumber: form.componentPartNumber || null,
        description: form.description || null,
        type: form.type,
        etaDate: form.etaDate || null,
        relationshipNotes: form.relationshipNotes || null,
      };
      const r = await fetch(mode === "create" ? "/api/v1/jobs" : `/api/v1/jobs/${jobId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save job.");
      if (mode === "create") router.push(`/jobs/${b.id}`);
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save job.");
    } finally {
      setSaving(false);
    }
  }

  async function postAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function putAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addPartRequirement() {
    if (!jobId || !partId) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partId, quantityRequired: Number(form.partQty), notes: form.partNotes || null, etaDate: form.partEtaDate || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to add part requirement.");
      setPartId(""); setPartQuery(""); updateField("partQty", "1"); updateField("partNotes", ""); updateField("partEtaDate", "");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add part requirement.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRequirement(requirementId: string) {
    if (!jobId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${requirementId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to update part requirement.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update part requirement.");
    } finally {
      setSaving(false);
    }
  }

  async function applyJobKit() {
    if (!jobId || !jobKitId) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/apply-kit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kitId: jobKitId }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to apply job kit.");
      setJobKitId("");
      setJobKitQuery("");
      setJobKitOptions([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to apply job kit.");
    } finally {
      setSaving(false);
    }
  }

  async function patchAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading job…</div>;

  return (
    <div className="job-workspace">
      <header className="page-header compact">
        <div>
          <Link href="/jobs" className="back-link"><ArrowLeft size={15} /> Back to jobs</Link>
          <p className="eyebrow">Jobs</p>
          <h1>{title}</h1>
          <p>{mode === "create" ? "Create a draft job before allocating the authoritative BRE number." : `${JOB_TYPE_LABELS[(job?.type || "STANDARD_REPAIR") as keyof typeof JOB_TYPE_LABELS]} · ${JOB_STATUS_LABELS[(job?.status || "DRAFT") as keyof typeof JOB_STATUS_LABELS]}`}</p>
        </div>
      </header>

      {error && <div className="inline-error">{error}</div>}

      <form className="job-layout" onSubmit={submitDraft}>
        <section className="detail-panel">
          <header><div><h2>Customer details</h2><p>Use existing customer records and branch/contact data already maintained in Apollo X.</p></div></header>
          <div className="drawer-fields">
            <label className="wide party-selector">
              <span>Customer *</span>
              <div><Search size={15} /><input value={customerQuery || (job?.customer?.name ? String(job.customer.name) : "")} onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerOptions(true); if (!e.target.value) updateField("customerId", ""); }} onFocus={() => setShowCustomerOptions(true)} placeholder="Search customer name, account code or branch" /></div>
              {showCustomerOptions && customerOptions.length > 0 && (
                <div className="selector-results">
                  {customerOptions.map((customer) => <button key={customer.id} type="button" onClick={() => { updateField("customerId", customer.id); setCustomerQuery(customer.name); setShowCustomerOptions(false); }}><strong>{customer.name}</strong><span>{customer.accountCode || customer.tradingName || "—"}</span></button>)}
                </div>
              )}
            </label>
            <label><span>Customer reference</span><input value={form.customerReference} onChange={(e) => updateField("customerReference", e.target.value)} /></label>
            <label><span>Customer PO</span><input value={form.customerPo} onChange={(e) => updateField("customerPo", e.target.value)} /></label>
          </div>
        </section>

        <section className="detail-panel">
          <header><div><h2>Machine / component details</h2><p>Capture the unit and component identifiers used by workshop and field teams.</p></div></header>
          <div className="drawer-fields">
            <label><span>Machine model</span><input value={form.machineModel} onChange={(e) => updateField("machineModel", e.target.value)} /></label>
            <label><span>Machine serial</span><input value={form.machineSerial} onChange={(e) => updateField("machineSerial", e.target.value)} /></label>
            <label><span>Component</span><input value={form.component} onChange={(e) => updateField("component", e.target.value)} /></label>
            <label><span>Component type</span><input value={form.componentType} onChange={(e) => updateField("componentType", e.target.value)} /></label>
            <label><span>Component serial</span><input value={form.componentSerial} onChange={(e) => updateField("componentSerial", e.target.value)} /></label>
            <label><span>Component part number</span><input value={form.componentPartNumber} onChange={(e) => updateField("componentPartNumber", e.target.value)} /></label>
          </div>
        </section>

        <section className="detail-panel">
          <header><div><h2>Job details</h2><p>Draft first, then register when ready to consume the authoritative BRE number.</p></div></header>
          <div className="drawer-fields">
            <label><span>Job type *</span><select value={form.type} onChange={(e) => updateField("type", e.target.value)}>{JOB_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>ETA date</span><input type="date" value={form.etaDate} onChange={(e) => updateField("etaDate", e.target.value)} /></label>
            <label className="wide"><span>Job description</span><textarea rows={4} value={form.description} onChange={(e) => updateField("description", e.target.value)} /></label>
            <label className="wide"><span>Relationship notes</span><textarea rows={4} value={form.relationshipNotes} onChange={(e) => updateField("relationshipNotes", e.target.value)} /></label>
          </div>
          <footer className="detail-actions"><button className="gold-button" disabled={saving || !form.customerId}><Save size={15} />{saving ? "Saving…" : mode === "create" ? "Create draft" : "Save changes"}</button></footer>
        </section>
      </form>

      {job && (
        <>
          <div className="detail-grid">
            <Info title="Job summary" values={[["BRE / draft", job.jobNumber || job.draftNumber], ["Status", JOB_STATUS_LABELS[job.status]], ["Type", JOB_TYPE_LABELS[job.type]], ["Customer", job.customer.name], ["Received", text(job.dateReceived)], ["ETA", text(job.etaDate)]]} />
            <Info title="Component details" values={[["Machine model", job.machineModel], ["Machine serial", job.machineSerial], ["Component", job.component], ["Component serial", job.componentSerial], ["Customer ref", job.customerReference], ["Customer PO", job.customerPo]]} />
          </div>

          <section className="detail-panel">
            <header><div><h2>Workflow actions</h2><p>Use the controlled Jobs service for registration, status changes, closure and reopening.</p></div></header>
            <div className="job-action-grid">
              {!job.jobNumber && (
                <div className="info-card"><header><h2>Register job</h2></header><div className="stack-row"><select value={form.registerStatus} onChange={(e) => updateField("registerStatus", e.target.value)}>{REGISTERABLE_STATUSES.map((value) => <option key={value} value={value}>{JOB_STATUS_LABELS[value as keyof typeof JOB_STATUS_LABELS]}</option>)}</select><button type="button" className="gold-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/register`, { initialStatus: form.registerStatus })}>Allocate BRE number</button></div></div>
              )}
              {job.jobNumber && job.status !== "DRAFT" && (
                <div className="info-card"><header><h2>Change status</h2></header><div className="stack-grid"><select value={form.changeStatus} onChange={(e) => updateField("changeStatus", e.target.value)}>{CHANGEABLE_STATUSES.map((value) => <option key={value} value={value}>{JOB_STATUS_LABELS[value as keyof typeof JOB_STATUS_LABELS]}</option>)}</select><input placeholder="Reason (optional)" value={form.statusReason} onChange={(e) => updateField("statusReason", e.target.value)} /><button type="button" className="quiet-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/status`, { status: form.changeStatus, reason: form.statusReason || null })}>Update status</button></div></div>
              )}
              {!["CLOSED"].includes(job.status) && job.jobNumber && <div className="info-card"><header><h2>Close job</h2></header><div className="stack-grid"><input placeholder="Outcome" value={form.closingOutcome} onChange={(e) => updateField("closingOutcome", e.target.value)} /><textarea rows={3} placeholder="Closing note" value={form.closingNote} onChange={(e) => updateField("closingNote", e.target.value)} /><button type="button" className="quiet-button" disabled={saving || form.closingOutcome.length < 2 || form.closingNote.length < 2} onClick={() => void postAction(`/api/v1/jobs/${job.id}/close`, { outcome: form.closingOutcome, closingNote: form.closingNote })}>Close job</button></div></div>}
              {["CLOSED", "CANCELLED", "COMPLETE"].includes(job.status) && <div className="info-card"><header><h2>Reopen job</h2></header><div className="stack-grid"><select value={form.reopenStatus} onChange={(e) => updateField("reopenStatus", e.target.value)}>{REGISTERABLE_STATUSES.map((value) => <option key={value} value={value}>{JOB_STATUS_LABELS[value as keyof typeof JOB_STATUS_LABELS]}</option>)}</select><input placeholder="Reason (optional)" value={form.reopenReason} onChange={(e) => updateField("reopenReason", e.target.value)} /><button type="button" className="quiet-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/reopen`, { status: form.reopenStatus, reason: form.reopenReason || null })}>Reopen job</button></div></div>}
            </div>
          </section>

          <section className="detail-panel">
            <header><div><h2>Parts required</h2><p>Requirements are visible here, but any actual reserve / issue / return must still flow through the immutable inventory ledger.</p></div></header>
            <div className="drawer-fields">
              <label className="wide party-selector"><span>Apply job kit</span><div><Search size={15} /><input value={jobKitQuery} onChange={(e) => { setJobKitQuery(e.target.value); setJobKitId(""); }} placeholder="Search job kit name, make or model" /></div>{jobKitOptions.length > 0 && <div className="selector-results">{jobKitOptions.map((kit) => <button key={kit.id} type="button" onClick={() => { setJobKitId(kit.id); setJobKitQuery(`${kit.name}${kit.machineMake ? ` · ${kit.machineMake}` : ""}${kit.machineModel ? ` ${kit.machineModel}` : ""}`); setJobKitOptions([]); }}><strong>{kit.name}</strong><span>{[kit.machineMake, kit.machineModel, kit.componentType].filter(Boolean).join(" · ") || "Reusable standard kit"}</span></button>)}</div>}</label>
              <label><span>&nbsp;</span><button type="button" className="quiet-button" disabled={saving || !jobKitId} onClick={() => void applyJobKit()}>Apply selected kit</button></label>
              <label className="wide party-selector"><span>Part</span><div><Search size={15} /><input value={partQuery} onChange={(e) => setPartQuery(e.target.value)} placeholder="Search part number or description" /></div>{partOptions.length > 0 && <div className="selector-results">{partOptions.map((part) => <button key={part.id} type="button" onClick={() => { setPartId(part.id); setPartQuery(`${text(part.partNumber)} · ${text(part.description)}`); setPartOptions([]); }}><strong>{text(part.partNumber)}</strong><span>{text(part.description)}</span></button>)}</div>}</label>
              <label><span>Qty required</span><input type="number" min="0.0001" step="0.0001" value={form.partQty} onChange={(e) => updateField("partQty", e.target.value)} /></label>
              <label><span>ETA date</span><input type="date" value={form.partEtaDate} onChange={(e) => updateField("partEtaDate", e.target.value)} /></label>
              <label className="wide"><span>Notes</span><textarea rows={3} value={form.partNotes} onChange={(e) => updateField("partNotes", e.target.value)} /></label>
            </div>
            <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !partId} onClick={() => void addPartRequirement()}><Plus size={15} /> Add requirement</button></footer>
            <div className="record-list">{job.partRequirements.map((req) => <article key={req.id} className={req.active === false ? "inactive" : ""}><div className="record-icon"><Plus size={14} /></div><div><strong>{text(req.part.partNumber)} · {text(req.part.description)}</strong><span>Required: {decimalText(req.summary?.quantityRequired ?? req.quantityRequired)} {text(req.part.unitOfMeasure)} · Reserved: {decimalText(req.summary?.quantityReserved)} · Issued: {decimalText(req.summary?.grossIssued)} · Returned: {decimalText(req.summary?.grossReturned)} · Outstanding: {decimalText(req.summary?.outstanding)}</span>{reserveRequirementId === String(req.id) && req.active !== false && <div className="stack-grid" style={{ marginTop: 8 }}><label className="party-selector"><span>Reserve from location</span><div><Search size={15} /><input value={locationQuery || (selectedLocation ? `${text(selectedLocation.code)} · ${text(selectedLocation.name)}` : "")} onChange={(e) => { setLocationQuery(e.target.value); setSelectedLocation(null); }} placeholder="Search active storage location" /></div>{locationOptions.length > 0 && <div className="selector-results">{locationOptions.map((location) => <button key={location.id} type="button" onClick={() => { setSelectedLocation(location); setLocationQuery(`${text(location.code)} · ${text(location.name)}`); setLocationOptions([]); }}><strong>{text(location.code)}</strong><span>{text(location.name)} · {text(location.type)}</span></button>)}</div>}</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><button type="button" className="quiet-button" disabled={saving || !selectedLocation} onClick={async () => { const quantity = window.prompt("Quantity to reserve", decimalText(req.summary?.outstanding ?? req.quantityRequired)); if (!quantity || !selectedLocation) return; const notes = window.prompt("Reservation notes (optional)", "") ?? ""; await postAction(`/api/v1/jobs/${job.id}/parts/${req.id}/reserve`, { locationId: selectedLocation.id, quantity, notes: notes || null, idempotencyKey: `job-reserve-${req.id}-${Date.now()}` }); setReserveRequirementId(""); setSelectedLocation(null); setLocationQuery(""); }}>Confirm reserve</button><button type="button" className="quiet-button" disabled={saving} onClick={() => { setReserveRequirementId(""); setSelectedLocation(null); setLocationQuery(""); setLocationOptions([]); }}>Cancel</button></div></div>}{Array.isArray(req.allocations) && req.allocations.length > 0 && <div className="stack-grid" style={{ marginTop: 8 }}>{req.allocations.map((allocation) => <div key={String(allocation.id)} className="info-card"><header><h2 style={{ fontSize: "0.95rem" }}>{text(allocation.location?.code) || text(allocation.location?.name)}</h2></header><div className="stack-grid"><span>Reserved: {decimalText(allocation.summary?.quantityReserved)} · Issued: {decimalText(allocation.summary?.quantityIssued)} · Returned: {decimalText(allocation.summary?.quantityReturned)} · Effective fulfilled: {decimalText(allocation.summary?.quantityEffectiveFulfilled)}</span><span>Returns go back to: {text(allocation.location?.code) || text(allocation.location?.name)}</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{allocation.stockReservationId && <button type="button" className="quiet-button" disabled={saving} onClick={async () => { const quantity = window.prompt("Quantity to issue", decimalText(allocation.summary?.quantityReserved)); if (!quantity) return; await postAction(`/api/v1/jobs/${job.id}/parts/allocations/${allocation.id}/issue`, { quantity, idempotencyKey: `job-issue-${allocation.id}-${Date.now()}` }); }}>Issue</button>}{allocation.stockReservationId && <button type="button" className="quiet-button" disabled={saving} onClick={async () => { const reason = window.prompt("Reason for releasing remaining reservation", "No longer required") ?? ""; await postAction(`/api/v1/jobs/${job.id}/parts/allocations/${allocation.id}/release`, { reason }); }}>Release reservation</button>}<button type="button" className="quiet-button" disabled={saving} onClick={async () => { const quantity = window.prompt(`Quantity to return to ${text(allocation.location?.code) || text(allocation.location?.name)}`, decimalText(allocation.summary?.quantityIssued)); if (!quantity) return; const reopen = window.confirm("Replacement Still Required? Click OK to reopen requirement, Cancel for Unused / Surplus."); const notes = window.prompt("Return notes (optional)", "") ?? ""; await postAction(`/api/v1/jobs/${job.id}/parts/allocations/${allocation.id}/return`, { quantity, disposition: reopen ? "REQUIREMENT_REMAINS" : "UNUSED_SURPLUS", notes: notes || null, idempotencyKey: `job-return-${allocation.id}-${Date.now()}` }); }}>Return</button></div></div></div>)}</div>}</div><span className={`status-pill ${req.active === false ? "neutral" : ""}`}>{req.active === false ? "Inactive" : "Active"}</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{req.active !== false && <button type="button" className="quiet-button" disabled={saving} onClick={() => { setReserveRequirementId(String(req.id)); setLocationOptions([]); setLocationQuery(""); setSelectedLocation(null); }}>Reserve</button>}{req.active !== false && <button type="button" className="table-action danger" onClick={() => void deactivateRequirement(req.id)}>Deactivate</button>}</div></article>)}</div>
          </section>

          {job.type === "FIELD_SERVICE" && <section className="detail-panel"><header><div><h2>Field service</h2><p>Capture site, technician and report details for field-service work.</p></div></header><div className="drawer-fields"><label><span>Site</span><input value={form.fieldSite} onChange={(e) => updateField("fieldSite", e.target.value)} /></label><label><span>Technician</span><input value={form.fieldTechnician} onChange={(e) => updateField("fieldTechnician", e.target.value)} /></label><label><span>Vehicle</span><input value={form.fieldVehicle} onChange={(e) => updateField("fieldVehicle", e.target.value)} /></label><label><span>Hours</span><input type="number" min="0" step="0.25" value={form.fieldHours} onChange={(e) => updateField("fieldHours", e.target.value)} /></label><label className="wide"><span>Report</span><textarea rows={4} value={form.fieldReport} onChange={(e) => updateField("fieldReport", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void putAction(`/api/v1/jobs/${job.id}/field-service`, { site: form.fieldSite || null, technician: form.fieldTechnician || null, vehicle: form.fieldVehicle || null, hours: form.fieldHours ? Number(form.fieldHours) : null, report: form.fieldReport || null })}>Save field-service info</button></footer></section>}

          {job.type === "WARRANTY" && <section className="detail-panel"><header><div><h2>Warranty</h2><p>Capture the current warranty state supported by Phase 4A.</p></div></header><div className="drawer-fields"><label><span>Warranty status</span><select value={form.warrantyStatus} onChange={(e) => updateField("warrantyStatus", e.target.value)}><option value="PENDING">Pending</option><option value="GRANTED">Granted</option><option value="DECLINED">Declined</option></select></label><label><span>Historical source status</span><input value={form.warrantyHistorical} onChange={(e) => updateField("warrantyHistorical", e.target.value)} /></label><label className="wide"><span>Warranty notes</span><textarea rows={4} value={form.warrantyNotes} onChange={(e) => updateField("warrantyNotes", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void putAction(`/api/v1/jobs/${job.id}/warranty`, { status: form.warrantyStatus, notes: form.warrantyNotes || null, historicalSourceStatus: form.warrantyHistorical || null })}>Save warranty info</button></footer></section>}

          {job.type === "STANDARD_REPAIR" && <section className="detail-panel"><header><div><h2>Transfer to PEX Stock</h2><p>Completed Standard Repair components can transfer independently into serialized PEX stock.</p></div></header>
            <div className="drawer-fields">
              <label className="wide party-selector"><span>Storage location</span><div><Search size={14} /><input value={pexLocationQuery} onFocus={() => setPexLocationQuery(pexLocationQuery)} onChange={(e) => { setPexLocationQuery(e.target.value); setSelectedPexLocation(null); }} placeholder="Search active storage locations…" /></div>{pexLocationOptions.length > 0 && <div className="selector-results">{pexLocationOptions.map((location) => <button type="button" key={location.id} onClick={() => { setSelectedPexLocation(location); setPexLocationQuery(`${text(location.code)} · ${text(location.name)}`); setPexLocationOptions([]); }}><strong>{text(location.code)}</strong><span>{text(location.name)} · {text(location.type)}</span></button>)}</div>}</label>
            </div>
            <div className="record-list pex-record-list">{job.components.map((component) => {
              const linkedUnit = job.pexSourceStockUnits.find((unit) => unit.sourceJobComponentId === component.id);
              return <article key={component.id}>
                <div className="record-icon">PX</div>
                <div><strong>{text(component.component || job.component)}</strong><span>{text(component.componentPartNumber)} · {text(component.componentSerial)} · {text(component.componentType)}</span></div>
                <span className={`status-pill ${linkedUnit ? "" : "neutral"}`}>{linkedUnit ? text(linkedUnit.status) : "Eligible"}</span>
                <div className="stack-grid pex-link-stack">{linkedUnit ? <><span className="muted small-line">Transferred to {text(linkedUnit.storageLocation?.code || linkedUnit.storageLocation?.name)}</span>{linkedUnit.currentSupplyJob?.id ? <Link href={`/jobs/${linkedUnit.currentSupplyJob.id}`} className="table-action">Open supply {text(linkedUnit.currentSupplyJob.jobNumber || linkedUnit.currentSupplyJob.draftNumber)}</Link> : null}</> : <span className="muted small-line">Not yet transferred to PEX Stock.</span>}</div>
                <div className="stack-row">{!linkedUnit && <button type="button" className="quiet-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex-transfer`, { jobComponentId: component.id, storageLocationId: selectedPexLocation?.id || null })}>Transfer</button>}</div>
              </article>;
            })}</div>
          </section>}

          {job.type === "PEX_SUPPLY" && <section className="detail-panel"><header><div><h2>PEX Supply</h2><p>Link one available PEX stock unit and track the automatically created return chain.</p></div></header>
            {job.pexSupplyLinksAsSupply[0] ? <div className="record-list pex-record-list"><article>
              <div className="record-icon">PX</div>
              <div><strong>{text(job.pexSupplyLinksAsSupply[0].pexStockUnit.component)}</strong><span>{text(job.pexSupplyLinksAsSupply[0].pexStockUnit.componentPartNumber)} · {text(job.pexSupplyLinksAsSupply[0].pexStockUnit.componentSerial)}</span></div>
              <span className="status-pill">{text(job.pexSupplyLinksAsSupply[0].returnStatus)}</span>
              <div className="stack-grid pex-link-stack"><span className="muted small-line">Return: {text(job.pexSupplyLinksAsSupply[0].returnJob?.jobNumber || job.pexSupplyLinksAsSupply[0].returnJob?.draftNumber)}</span><span className="muted small-line">Expected core: {text(job.pexSupplyLinksAsSupply[0].expectedCoreDescription)} · {text(job.pexSupplyLinksAsSupply[0].expectedCorePartNumber)} · {text(job.pexSupplyLinksAsSupply[0].expectedCoreSerial)}</span>{job.pexSupplyLinksAsSupply[0].returnJob?.id ? <Link href={`/jobs/${job.pexSupplyLinksAsSupply[0].returnJob?.id}`} className="table-action">Open return</Link> : null}</div>
              <div className="stack-row">{job.pexSupplyLinksAsSupply[0].active && <button type="button" className="table-action danger" disabled={saving} onClick={async () => { const reason = window.prompt("Cancellation reason", "")?.trim(); if (!reason) return; await deleteAction(`/api/v1/pex-tracking/supply/${job.id}`, { reason }); }}>Cancel link</button>}</div>
            </article></div> : <><div className="drawer-fields"><label className="wide party-selector"><span>Available PEX stock unit</span><div><Search size={14} /><input value={pexSupplyQuery} onChange={(e) => setPexSupplyQuery(e.target.value)} placeholder="Search available component, part number, serial or location…" /></div>{pexSupplyOptions.length > 0 && <div className="selector-results">{pexSupplyOptions.map((unit) => <button type="button" key={unit.id} onClick={() => { setSelectedPexUnitId(unit.id); setPexSupplyQuery(`${text(unit.component)} · ${text(unit.componentSerial || unit.componentPartNumber)}`); setPexSupplyOptions([]); }}><strong>{text(unit.component)}</strong><span>{text(unit.componentPartNumber)} · {text(unit.componentSerial)} · {text(unit.storageLocation?.code || unit.storageLocation?.name)} · {text(unit.sourceJob?.jobNumber || unit.sourceJob?.draftNumber)}</span></button>)}</div>}</label><label><span>Expected core component</span><input value={form.pexReturnedCoreDescription} onChange={(e) => updateField("pexReturnedCoreDescription", e.target.value)} placeholder="Optional override" /></label><label><span>Expected core type</span><input value={form.pexReturnedCoreType} onChange={(e) => updateField("pexReturnedCoreType", e.target.value)} /></label><label><span>Expected core part number</span><input value={form.pexReturnedCorePartNumber} onChange={(e) => updateField("pexReturnedCorePartNumber", e.target.value)} /></label><label><span>Expected core serial</span><input value={form.pexReturnedCoreSerial} onChange={(e) => updateField("pexReturnedCoreSerial", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !selectedPexUnitId} onClick={() => void postAction(`/api/v1/pex-tracking/supply/${job.id}`, { pexStockUnitId: selectedPexUnitId, expectedCoreDescription: form.pexReturnedCoreDescription || null, expectedCoreType: form.pexReturnedCoreType || null, expectedCorePartNumber: form.pexReturnedCorePartNumber || null, expectedCoreSerial: form.pexReturnedCoreSerial || null })}>Link available PEX unit</button></footer></>}
          </section>}

          {job.type === "PEX_RETURN" && job.pexSupplyLinksAsReturn[0] && <section className="detail-panel"><header><div><h2>PEX Return</h2><p>Receive the returned core, close without return, or use the approved correction workflow.</p></div></header>
            <div className="record-list pex-record-list"><article>
              <div className="record-icon">RT</div>
              <div><strong>{text(job.pexSupplyLinksAsReturn[0].supplyJob?.jobNumber || job.pexSupplyLinksAsReturn[0].supplyJob?.draftNumber)}</strong><span>{text(job.pexSupplyLinksAsReturn[0].pexStockUnit.component)} · {text(job.pexSupplyLinksAsReturn[0].pexStockUnit.componentPartNumber)} · {text(job.pexSupplyLinksAsReturn[0].pexStockUnit.componentSerial)}</span></div>
              <span className="status-pill">{text(job.pexSupplyLinksAsReturn[0].returnStatus)}</span>
              <div className="stack-grid pex-link-stack"><span className="muted small-line">Expected core: {text(job.pexSupplyLinksAsReturn[0].expectedCoreDescription)} · {text(job.pexSupplyLinksAsReturn[0].expectedCorePartNumber)} · {text(job.pexSupplyLinksAsReturn[0].expectedCoreSerial)}</span><span className="muted small-line">Actual core: {text(job.pexSupplyLinksAsReturn[0].returnedCoreDescription)} · {text(job.pexSupplyLinksAsReturn[0].returnedCorePartNumber)} · {text(job.pexSupplyLinksAsReturn[0].returnedCoreSerial)}</span>{job.pexSupplyLinksAsReturn[0].returnMismatchReason ? <span className="muted small-line">Mismatch: {text(job.pexSupplyLinksAsReturn[0].returnMismatchReason)}</span> : null}</div>
              <div className="stack-grid pex-action-stack">{job.pexSupplyLinksAsReturn[0].returnStatus === "EXPECTED" && <><label><span>Returned component</span><input value={form.pexReturnedCoreDescription} onChange={(e) => updateField("pexReturnedCoreDescription", e.target.value)} /></label><label><span>Returned type</span><input value={form.pexReturnedCoreType} onChange={(e) => updateField("pexReturnedCoreType", e.target.value)} /></label><label><span>Returned part number</span><input value={form.pexReturnedCorePartNumber} onChange={(e) => updateField("pexReturnedCorePartNumber", e.target.value)} /></label><label><span>Returned serial</span><input value={form.pexReturnedCoreSerial} onChange={(e) => updateField("pexReturnedCoreSerial", e.target.value)} /></label><label className="wide"><span>Mismatch reason if different</span><input value={form.pexMismatchReason} onChange={(e) => updateField("pexMismatchReason", e.target.value)} /></label><div className="stack-row"><button type="button" className="quiet-button" disabled={saving || form.pexReturnedCoreDescription.trim().length < 2} onClick={() => void postAction(`/api/v1/pex-tracking/supply/${job.pexSupplyLinksAsReturn[0].supplyJob?.id}/receive`, { returnedCoreDescription: form.pexReturnedCoreDescription, returnedCoreType: form.pexReturnedCoreType || null, returnedCorePartNumber: form.pexReturnedCorePartNumber || null, returnedCoreSerial: form.pexReturnedCoreSerial || null, returnMismatchReason: form.pexMismatchReason || null })}>Receive core</button></div><label className="wide"><span>Close without return reason</span><input value={form.pexCloseReason} onChange={(e) => updateField("pexCloseReason", e.target.value)} /></label><label className="wide"><span>Close note</span><textarea rows={3} value={form.pexCloseNote} onChange={(e) => updateField("pexCloseNote", e.target.value)} /></label><div className="stack-row"><button type="button" className="table-action danger" disabled={saving || form.pexCloseReason.trim().length < 2} onClick={() => void postAction(`/api/v1/pex-tracking/supply/${job.pexSupplyLinksAsReturn[0].supplyJob?.id}/close-without-return`, { closedWithoutReturnReason: form.pexCloseReason, closedWithoutReturnNote: form.pexCloseNote || null })}>Close without return</button></div></>}
                {job.pexSupplyLinksAsReturn[0].returnStatus !== "EXPECTED" && <span className="muted small-line">This return has been resolved and is read-only for incompatible actions.</span>}
                {job.pexSupplyLinksAsReturn[0].supplyJob?.id && <><label className="wide"><span>Correction / relink reason</span><input value={form.pexCorrectionReason} onChange={(e) => updateField("pexCorrectionReason", e.target.value)} /></label><label className="wide party-selector"><span>Relink to available PEX unit</span><div><Search size={14} /><input value={pexSupplyQuery} onChange={(e) => setPexSupplyQuery(e.target.value)} placeholder="Search available PEX stock…" /></div>{pexSupplyOptions.length > 0 && <div className="selector-results">{pexSupplyOptions.map((unit) => <button type="button" key={unit.id} onClick={() => { setSelectedPexUnitId(unit.id); setPexSupplyQuery(`${text(unit.component)} · ${text(unit.componentSerial || unit.componentPartNumber)}`); setPexSupplyOptions([]); }}><strong>{text(unit.component)}</strong><span>{text(unit.componentPartNumber)} · {text(unit.componentSerial)} · {text(unit.storageLocation?.code || unit.storageLocation?.name)}</span></button>)}</div>}</label><div className="stack-row"><button type="button" className="quiet-button" disabled={saving || !selectedPexUnitId || form.pexCorrectionReason.trim().length < 2} onClick={() => void patchAction(`/api/v1/pex-tracking/supply/${job.pexSupplyLinksAsReturn[0].supplyJob?.id}`, { pexStockUnitId: selectedPexUnitId, reason: form.pexCorrectionReason })}>Relink chain</button></div></>}
              </div>
            </article></div>
          </section>}

          <section className="detail-panel"><header><div><h2>Notes</h2><p>Business-facing notes stay with the job and appear in history.</p></div></header><div className="drawer-fields"><label className="wide"><span>New note</span><textarea rows={4} value={form.note} onChange={(e) => updateField("note", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || form.note.trim().length < 2} onClick={async () => { await postAction(`/api/v1/jobs/${job.id}/notes`, { note: form.note }); updateField("note", ""); }}>Add note</button></footer><div className="record-list">{job.notes.map((note) => <article key={note.id}><div className="record-icon"><Plus size={14} /></div><div><strong>{text(note.note)}</strong><span>{note.createdBy?.displayName || "System"}</span></div><span>{new Date(String(note.createdAt)).toLocaleString("en-ZA")}</span></article>)}</div></section>

          <section className="detail-panel"><header><div><h2>Activity history</h2><p>Chronological workflow history from the Jobs service.</p></div></header><div className="history-list">{job.activities.map((activity) => <article key={activity.id}><strong>{text(activity.description)}</strong><span>{text(activity.type).replaceAll("_", " ")} · {activity.actor?.displayName || "System"}</span><time>{new Date(String(activity.createdAt)).toLocaleString("en-ZA")}</time></article>)}</div></section>
        </>
      )}
    </div>
  );
}
/* eslint-enable react-hooks/set-state-in-effect */

function Info({ title, values }: { title: string; values: Array<[string, unknown]> }) {
  return <section className="info-card"><header><h2>{title}</h2></header><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl></section>;
}