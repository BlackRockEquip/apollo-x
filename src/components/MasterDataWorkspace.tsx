"use client";
/* eslint-disable jsx-a11y/role-supports-aria-props -- native aside is the visual drawer container */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";

type Field={key:string;label:string;type?:"text"|"email"|"number"|"date"|"select"|"textarea"|"checkbox"|"address-group"|"contact-list";required?:boolean;options?:Array<{value:string;label:string}>;placeholder?:string;
  // "contact-list" only: shows a per-row "Can receive RFQs" checkbox (see
  // SupplierContact.canReceiveRfq) — suppliers only, customers have no
  // equivalent since RFQs never go to a customer.
  contactRfqToggle?:boolean};
type ColumnFormat="currency-zar"|"percent"|"date-za"|"boolean-included";
type Column={key:string;label:string;format?:ColumnFormat};
export type MasterConfig={kind:string;title:string;eyebrow:string;description:string;singular:string;fields:Field[];columns:Column[];detailBasePath?:string;
  // 2026-09-10 — per-row delete button, added for Manufacturers and Storage
  // Locations (see ui-config.ts). Off by default so kinds nobody asked for
  // delete on (Customers, Suppliers, Parts — Parts has its own bespoke
  // delete on the merged Stock Levels page instead, Services, Tax Codes,
  // Commercial Terms, Numbering) keep behaving exactly as before.
  deletable?:boolean};
type ListResponse={items:Array<Record<string,unknown>&{id:string;active?:boolean}>;total:number;page:number;pageSize:number};

// Inline "billing address" + repeatable "contacts" sections shown on the
// New Customer / New Supplier drawer only (see the address-group /
// contact-list field types above, configured per-kind in ui-config.ts) —
// added at the user's request ("add address fields like modapp, as well
// as the contacts section to add more contacts") so a customer/supplier
// can be set up in one step instead of "create, then add contacts"
// afterward on its detail page. Deliberately create-only: editing an
// existing record's addresses/contacts already has a full, more capable
// UI on that record's own detail page (PartyDetailWorkspace.tsx) — this
// drawer's Edit mode stays scalar-fields-only, same as before.
type AddressRow={type:string;line1:string;line2:string;city:string;province:string;postalCode:string};
type ContactRow={id:string;firstName:string;lastName:string;position:string;telephone:string;mobile:string;email:string;isPrimary:boolean;canReceiveRfq:boolean};
const BLANK_ADDRESS:AddressRow={type:"BILLING",line1:"",line2:"",city:"",province:"",postalCode:""};
const ADDRESS_TYPE_OPTIONS=["BILLING","DELIVERY","PHYSICAL","POSTAL"];

function valueAt(row:Record<string,unknown>,path:string){return path.split(".").reduce<unknown>((v,k)=>v&&typeof v==="object"?(v as Record<string,unknown>)[k]:undefined,row);}
function formatValue(value: unknown, format?: ColumnFormat) {
  if (value == null || value === "") return "—";
  if (!format) return String(value);
  switch (format) {
    case "currency-zar":
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value));
    case "percent":
      return `${(Number(value) * 100).toFixed(2)}%`;
    case "date-za":
      return new Date(String(value)).toLocaleDateString("en-ZA");
    case "boolean-included":
      return value ? "Included" : "Not included";
    default:
      return String(value);
  }
}
export function MasterDataWorkspace({ config, hideHeader }: { config: MasterConfig; hideHeader?: boolean }) {
  const [data,setData]=useState<ListResponse>({items:[],total:0,page:1,pageSize:25}); const [q,setQ]=useState(""); const [status,setStatus]=useState("active"); const [page,setPage]=useState(1); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<(Record<string,unknown>&{id:string})|null>(null); const [saving,setSaving]=useState(false); const [rowBusy,setRowBusy]=useState<string|null>(null);
  const addressField=config.fields.find(f=>f.type==="address-group"); const contactField=config.fields.find(f=>f.type==="contact-list"); const scalarFields=config.fields.filter(f=>f.type!=="address-group"&&f.type!=="contact-list");
  // Tabbed "Details / Address / Contacts" layout, added at the user's
  // request — only shown in "New" mode (no address/contacts fields render
  // at all when editing, see the !editing gates below, so there's nothing
  // to tab between then). Sections stay mounted and are just hidden with
  // the `hidden` attribute rather than unmounted, so their form state
  // (address/contacts React state, and the scalar fields' uncontrolled
  // inputs) survives switching tabs and is still picked up by submit()'s
  // FormData read regardless of which tab is active when Save is clicked.
  const [formTab,setFormTab]=useState<"details"|"address"|"contacts">("details");
  const showTabs=!editing&&Boolean(addressField||contactField);
  const [address,setAddress]=useState<AddressRow>(BLANK_ADDRESS); const nextContactRowId=useRef(1); const [contacts,setContacts]=useState<ContactRow[]>([]);
  function blankContactRow():ContactRow{return{id:`row-${nextContactRowId.current++}`,firstName:"",lastName:"",position:"",telephone:"",mobile:"",email:"",isPrimary:false,canReceiveRfq:false};}
  function addContactRow(){setContacts(rows=>[...rows,blankContactRow()]);}
  function removeContactRow(id:string){setContacts(rows=>rows.filter(r=>r.id!==id));}
  function updateContactRow(id:string,patch:Partial<ContactRow>){setContacts(rows=>rows.map(r=>r.id===id?{...r,...patch}:r));}
  const load=useCallback(async()=>{setLoading(true);setError("");try{const p=new URLSearchParams({q,status,page:String(page),pageSize:"25"});const r=await fetch(`/api/v1/master-data/${config.kind}?${p}`,{cache:"no-store"});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to load records.");setData(body);}catch(e){setError(e instanceof Error?e.message:"Unable to load records.");}finally{setLoading(false);}},[config.kind,page,q,status]);
  useEffect(()=>{const t=setTimeout(load,200);return()=>clearTimeout(t);},[load]);
  const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
  function show(row?:Record<string,unknown>&{id:string}){setEditing(row||null);if(!row){setAddress(BLANK_ADDRESS);setContacts(contactField?[blankContactRow()]:[]);}setFormTab("details");setOpen(true);}
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError("");const fd=new FormData(e.currentTarget);const payload:Record<string,unknown>={};for(const f of scalarFields){const raw=fd.get(f.key);if(f.type==="checkbox")payload[f.key]=raw==="on";else if(f.type==="number")payload[f.key]=raw===""?null:Number(raw);else payload[f.key]=raw===""?null:raw;}if(!editing){if(addressField)payload[addressField.key]=address;if(contactField)payload[contactField.key]=contacts.map(({id,...rest})=>rest);}try{const r=await fetch(`/api/v1/master-data/${config.kind}${editing?`/${editing.id}`:""}`,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to save.");setOpen(false);await load();}catch(e){setError(e instanceof Error?e.message:"Unable to save.");}finally{setSaving(false);}}
  // 2026-09-10 — per-row delete (Manufacturers, Storage Locations — see
  // config.deletable in ui-config.ts). Mirrors StockLevelsWorkspace's own
  // deleteRow: the backend (deleteMasterRecord in master-data/service.ts)
  // tries a real delete first and only falls back to marking the record
  // inactive if something else still references it, so the confirm text
  // says that up front rather than the UI claiming an unconditional delete.
  async function removeRow(row:Record<string,unknown>&{id:string}){const label=String(row.name??row.code??config.singular);if(!confirm(`Delete ${label}? If it's still referenced elsewhere (for example by parts or stock history) it can't actually be removed — it'll be marked inactive instead.`))return;setRowBusy(row.id);setError("");try{const r=await fetch(`/api/v1/master-data/${config.kind}/${row.id}`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to delete.");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to delete.");}finally{setRowBusy(null);}}
  // 2026-09-10 — hideHeader lets a page that already renders its own
  // eyebrow/h1 above the shared settings tab bar (tax-codes, commercial-
  // terms, numbering — see their page.tsx files) skip this component's own
  // internal page-header, so the tab bar reads as "below the page heading"
  // the same way it does on every other Settings destination instead of
  // sitting above a second, duplicate-looking heading. The "New X" action
  // just moves into the toolbar row in that case, rather than disappearing.
  return <>{!hideHeader && <header className="page-header master-header"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div><button className="gold-button" onClick={()=>show()}><Plus size={15}/> New {config.singular}</button></header>}
    <section className="master-panel"><div className="master-toolbar"><label className="search-control"><Search size={15}/><input aria-label={`Search ${config.title}`} value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder={`Search ${config.title.toLowerCase()}…`}/></label><select aria-label="Status filter" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option></select><span>{data.total} record{data.total===1?"":"s"}</span>{hideHeader && <button className="gold-button" onClick={()=>show()}><Plus size={15}/> New {config.singular}</button>}</div>
      {error&&<div className="inline-error">{error}</div>}{loading?<div className="table-state"><Loader2 className="spin" size={20}/>Loading…</div>:data.items.length===0?<div className="table-state">No matching records. Create the first {config.singular.toLowerCase()} when ready.</div>:<div className="data-table-wrap"><table className="data-table"><thead><tr>{config.columns.map(c=><th key={c.key}>{c.label}</th>)}<th>Status</th><th></th></tr></thead><tbody>{data.items.map(row=><tr key={row.id}>{config.columns.map(c=><td key={c.key}>{formatValue(valueAt(row,c.key),c.format)}</td>)}<td><span className={`status-pill ${row.active===false?"neutral":""}`}>{row.active===false?"Inactive":"Active"}</span></td><td>{config.detailBasePath?<Link className="table-action" href={`${config.detailBasePath}/${row.id}`}>View</Link>:null}<button className="table-action" onClick={()=>show(row)}>Edit</button>{config.deletable&&<button type="button" className="table-action danger" disabled={rowBusy===row.id} onClick={()=>void removeRow(row)}>{rowBusy===row.id?<Loader2 className="spin" size={14}/>:<Trash2 size={14}/>}</button>}</td></tr>)}</tbody></table></div>}
      <footer className="table-footer"><span>Page {data.page} of {pages}</span><div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button></div></footer></section>
    {open&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><aside className="form-drawer wide-drawer" aria-modal="true"><header><div><p className="eyebrow">Master data</p><h2>{editing?"Edit":"New"} {config.singular}</h2></div><button aria-label="Close" onClick={()=>setOpen(false)}><X size={18}/></button></header><form onSubmit={submit}>
      {showTabs&&<nav className="detail-tabs form-tab-nav"><button type="button" className={formTab==="details"?"active":""} onClick={()=>setFormTab("details")}>Details</button>{addressField&&<button type="button" className={formTab==="address"?"active":""} onClick={()=>setFormTab("address")}>Address</button>}{contactField&&<button type="button" className={formTab==="contacts"?"active":""} onClick={()=>setFormTab("contacts")}>Contacts</button>}</nav>}
      <div className="drawer-fields" hidden={showTabs&&formTab!=="details"}>{scalarFields.map(f=><label key={f.key} className={f.type==="textarea"?"wide":""}>{f.type==="checkbox"?<><input name={f.key} type="checkbox" defaultChecked={editing?Boolean(editing[f.key]):f.key==="active"}/><span>{f.label}</span></>:<><span>{f.label}{f.required&&" *"}</span>{f.type==="select"?<select name={f.key} required={f.required} defaultValue={String(editing?.[f.key]??"")}><option value="">Select…</option>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="textarea"?<textarea name={f.key} defaultValue={String(editing?.[f.key]??"")} rows={4}/>:<input name={f.key} type={f.type||"text"} required={f.required} step={f.type==="number"?"0.0001":undefined} defaultValue={String(editing?.[f.key]??"")} placeholder={f.placeholder}/>}</>}</label>)}</div>

      {!editing&&addressField&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="address"}><header><div><h2>{addressField.label}</h2><p>Optional — leave the address line blank to skip it and add one later.</p></div></header><div className="drawer-fields"><label><span>Address type</span><select value={address.type} onChange={e=>setAddress(a=>({...a,type:e.target.value}))}>{ADDRESS_TYPE_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label><span>Address line 1</span><input value={address.line1} onChange={e=>setAddress(a=>({...a,line1:e.target.value}))} placeholder="Street address"/></label><label><span>Address line 2</span><input value={address.line2} onChange={e=>setAddress(a=>({...a,line2:e.target.value}))}/></label><label><span>City</span><input value={address.city} onChange={e=>setAddress(a=>({...a,city:e.target.value}))}/></label><label><span>Province</span><input value={address.province} onChange={e=>setAddress(a=>({...a,province:e.target.value}))}/></label><label><span>Postal code</span><input value={address.postalCode} onChange={e=>setAddress(a=>({...a,postalCode:e.target.value}))}/></label></div></section>}

      {!editing&&contactField&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="contacts"}><header><div><h2>{contactField.label}</h2><p>Add one or more contacts now, or leave blank and add them later.</p></div><button type="button" className="quiet-button" onClick={addContactRow}><Plus size={14}/> Add contact</button></header>{contacts.length===0?<p className="muted small-line">No contacts added yet.</p>:<div className="data-table-wrap"><table className="data-table"><thead><tr><th>First name</th><th>Surname</th><th>Position</th><th>Email</th><th>Telephone</th><th>Mobile</th><th>Primary</th>{contactField.contactRfqToggle&&<th>Can receive RFQs</th>}<th></th></tr></thead><tbody>{contacts.map(row=><tr key={row.id}><td><input value={row.firstName} onChange={e=>updateContactRow(row.id,{firstName:e.target.value})} placeholder="First name"/></td><td><input value={row.lastName} onChange={e=>updateContactRow(row.id,{lastName:e.target.value})} placeholder="Surname"/></td><td><input value={row.position} onChange={e=>updateContactRow(row.id,{position:e.target.value})} placeholder="Position"/></td><td><input type="email" value={row.email} onChange={e=>updateContactRow(row.id,{email:e.target.value})} placeholder="Email"/></td><td><input value={row.telephone} onChange={e=>updateContactRow(row.id,{telephone:e.target.value})} placeholder="Telephone"/></td><td><input value={row.mobile} onChange={e=>updateContactRow(row.id,{mobile:e.target.value})} placeholder="Mobile"/></td><td><input type="checkbox" checked={row.isPrimary} onChange={e=>updateContactRow(row.id,{isPrimary:e.target.checked})}/></td>{contactField.contactRfqToggle&&<td><input type="checkbox" checked={row.canReceiveRfq} onChange={e=>updateContactRow(row.id,{canReceiveRfq:e.target.checked})}/></td>}<td><button type="button" className="table-action danger" onClick={()=>removeContactRow(row.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}</section>}

      <footer><button type="button" className="quiet-button" onClick={()=>setOpen(false)}>Cancel</button><button className="gold-button" disabled={saving}>{saving?<Loader2 className="spin" size={15}/>:null}{saving?"Saving…":"Save"}</button></footer></form></aside></div>}</>;
}
