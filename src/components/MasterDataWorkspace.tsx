"use client";
/* eslint-disable jsx-a11y/role-supports-aria-props -- native aside is the visual drawer container */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { readListState, writeListState } from "./list-state";
import { ScrollRestore } from "./ScrollRestore";

type Field={key:string;label:string;type?:"text"|"email"|"number"|"date"|"select"|"textarea"|"checkbox"|"address-group"|"contact-list"|"manufacturer-multiselect"|"payment-term"|"tax-code";required?:boolean;options?:Array<{value:string;label:string}>;placeholder?:string;
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
  deletable?:boolean;
  // 2026-09-14 — "Merge" button in the toolbar (Customers/Suppliers only,
  // see ui-config.ts), at the user's request ("Create merge client/supplier
  // buttons on respective page"). Posts to /api/v1/{kind}/merge — see
  // src/lib/merge/service.ts for the reassign-then-deactivate behavior.
  mergeable?:boolean};
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
// drawer's Edit mode now ALSO covers them (2026-10-06, see loadEditDetail).
type AddressRow={type:string;line1:string;line2:string;city:string;province:string;postalCode:string};
// serverId/orig/notes/branchId are only set on rows loaded from an EXISTING
// record when its Edit drawer opens (see loadEditDetail): serverId says "this
// is an existing contact/address, PATCH it", orig is a JSON snapshot used to
// skip untouched rows on save, and notes/branchId are carried through
// untouched because the child PATCH endpoints replace the whole row.
type ContactRow={id:string;firstName:string;lastName:string;position:string;telephone:string;mobile:string;email:string;isPrimary:boolean;canReceiveRfq:boolean;serverId?:string;orig?:string;notes?:string|null;branchId?:string|null};
type AddrEditRow={key:string;serverId?:string;orig?:string;type:string;label:string;line1:string;line2:string;city:string;province:string;postalCode:string;countryCode:string;isPrimary:boolean;branchId:string|null};
const str=(v:unknown)=>typeof v==="string"?v:v==null?"":String(v);
const contactPayload=(r:ContactRow)=>({firstName:r.firstName.trim(),lastName:r.lastName.trim()||null,position:r.position.trim()||null,telephone:r.telephone.trim()||null,mobile:r.mobile.trim()||null,email:r.email.trim()||null,notes:r.notes??null,isPrimary:r.isPrimary,active:true,branchId:r.branchId??null,canReceiveRfq:r.canReceiveRfq});
const addressPayload=(r:AddrEditRow)=>({type:r.type,label:r.label.trim()||null,line1:r.line1.trim(),line2:r.line2.trim()||null,city:r.city.trim()||null,province:r.province.trim()||null,postalCode:r.postalCode.trim()||null,countryCode:r.countryCode.trim()||"ZA",isPrimary:r.isPrimary,active:true,branchId:r.branchId});
const contactBlank=(r:ContactRow)=>!(r.firstName.trim()||r.lastName.trim()||r.position.trim()||r.email.trim()||r.telephone.trim()||r.mobile.trim());
const addressBlank=(r:AddrEditRow)=>!(r.line1.trim()||r.line2.trim()||r.city.trim()||r.province.trim()||r.postalCode.trim());
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
  // 2026-09-15, user request: "Back button to take you back to where you
  // last were." q/status/page restored from sessionStorage (see
  // list-state.ts), keyed per config.kind so Suppliers/Manufacturers/etc
  // each remember their own — otherwise clicking a record's "View" link and
  // then the browser's own Back button always dumped you back on an
  // unfiltered page 1.
  const [data,setData]=useState<ListResponse>({items:[],total:0,page:1,pageSize:25}); const [q,setQ]=useState(()=>readListState(`master-data.${config.kind}`,{q:"",status:"active",page:1}).q); const [status,setStatus]=useState(()=>readListState(`master-data.${config.kind}`,{q:"",status:"active",page:1}).status); const [page,setPage]=useState(()=>readListState(`master-data.${config.kind}`,{q:"",status:"active",page:1}).page); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<(Record<string,unknown>&{id:string})|null>(null); const [saving,setSaving]=useState(false); const [rowBusy,setRowBusy]=useState<string|null>(null); const [deletingAll,setDeletingAll]=useState(false);
  // Merge — new 2026-09-14 (see config.mergeable above). Two typeaheads:
  // the record picked as "keep" (survivor) and the one picked as "merge
  // away" (deactivated afterwards, everything of its reassigned to the
  // survivor) — see src/lib/merge/service.ts for the actual behavior.
  const [showMerge,setShowMerge]=useState(false); const [merging,setMerging]=useState(false); const [mergeError,setMergeError]=useState("");
  const [keepQuery,setKeepQuery]=useState(""); const [keepOptions,setKeepOptions]=useState<Array<{id:string;name:string}>>([]); const [keepId,setKeepId]=useState("");
  const [awayQuery,setAwayQuery]=useState(""); const [awayOptions,setAwayOptions]=useState<Array<{id:string;name:string}>>([]); const [awayId,setAwayId]=useState("");
  useEffect(()=>{if(!showMerge)return;const t=keepQuery.trim();if(t.length<2){setKeepOptions([]);return;}const timer=setTimeout(()=>{fetch(`/api/v1/master-data/${config.kind}?q=${encodeURIComponent(t)}&status=active&pageSize=20`,{cache:"no-store"}).then(r=>r.json()).then(b=>setKeepOptions((b.items||[]).map((r:{id:string;name:string})=>({id:r.id,name:r.name}))));},200);return()=>clearTimeout(timer);},[keepQuery,showMerge,config.kind]);
  useEffect(()=>{if(!showMerge)return;const t=awayQuery.trim();if(t.length<2){setAwayOptions([]);return;}const timer=setTimeout(()=>{fetch(`/api/v1/master-data/${config.kind}?q=${encodeURIComponent(t)}&status=active&pageSize=20`,{cache:"no-store"}).then(r=>r.json()).then(b=>setAwayOptions((b.items||[]).map((r:{id:string;name:string})=>({id:r.id,name:r.name}))));},200);return()=>clearTimeout(timer);},[awayQuery,showMerge,config.kind]);
  function resetMerge(){setKeepQuery("");setKeepId("");setKeepOptions([]);setAwayQuery("");setAwayId("");setAwayOptions([]);setMergeError("");}
  // 2026-10-02 — user request: "When clicking in fields that have
  // dropdowns, and i click onto another field, the dropdown does not go
  // away." Same fix as JobWorkspace.tsx's own closeDropdownUnlessWithin
  // (see its comment there) — the two merge-picker typeaheads below never
  // closed their .selector-results dropdown on their own. Attached as
  // onBlur on each dropdown's own wrapping <label> (which contains both the
  // input and the dropdown), this closes it as soon as focus moves OUTSIDE
  // that wrapper, but not when focus moves to one of the dropdown's own
  // option buttons.
  function closeDropdownUnlessWithin(close:()=>void){return (e:React.FocusEvent<HTMLElement>)=>{if(e.currentTarget.contains(e.relatedTarget as Node|null))return;close();};}
  async function submitMerge(){if(!keepId||!awayId||keepId===awayId)return;setMerging(true);setMergeError("");try{const r=await fetch(`/api/v1/${config.kind}/merge`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({survivingId:keepId,losingId:awayId})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||"Unable to merge.");setShowMerge(false);resetMerge();await load();}catch(e){setMergeError(e instanceof Error?e.message:"Unable to merge.");}finally{setMerging(false);}}
  const addressField=config.fields.find(f=>f.type==="address-group"); const contactField=config.fields.find(f=>f.type==="contact-list"); const manufacturerField=config.fields.find(f=>f.type==="manufacturer-multiselect"); const scalarFields=config.fields.filter(f=>f.type!=="address-group"&&f.type!=="contact-list"&&f.type!=="manufacturer-multiselect");
  // Tabbed "Details / Address / Contacts" layout, added at the user's
  // request — only shown in "New" mode (no address/contacts fields render
  // at all when editing, see the !editing gates below, so there's nothing
  // to tab between then). Sections stay mounted and are just hidden with
  // the `hidden` attribute rather than unmounted, so their form state
  // (address/contacts React state, and the scalar fields' uncontrolled
  // inputs) survives switching tabs and is still picked up by submit()'s
  // FormData read regardless of which tab is active when Save is clicked.
  const [formTab,setFormTab]=useState<"details"|"address"|"contacts"|"brands">("details");
  const showTabs=Boolean(addressField||contactField||manufacturerField);
  const [address,setAddress]=useState<AddressRow>(BLANK_ADDRESS); const nextContactRowId=useRef(1); const [contacts,setContacts]=useState<ContactRow[]>([]);
  function blankContactRow():ContactRow{return{id:`row-${nextContactRowId.current++}`,firstName:"",lastName:"",position:"",telephone:"",mobile:"",email:"",isPrimary:false,canReceiveRfq:false};}
  function addContactRow(){setContacts(rows=>[...rows,blankContactRow()]);}
  function removeContactRow(id:string){setContacts(rows=>rows.filter(r=>r.id!==id));}
  function updateContactRow(id:string,patch:Partial<ContactRow>){setContacts(rows=>rows.map(r=>r.id===id?{...r,...patch}:r));}
  // "Brands supplied" (Suppliers only, create-only — same reasoning as
  // address/contacts above: an existing supplier's brands already have a
  // fuller dedicated UI, the "Brands" tab on PartyDetailWorkspace.tsx,
  // which can add/remove them one at a time after creation). Lets you pick
  // from the company's existing Manufacturer records, or add a brand that
  // doesn't exist yet without leaving this form (posts to the same
  // MANUFACTURERS_CREATE-gated endpoint the Manufacturers screen's own
  // "New Manufacturer" form uses).
  const [availableManufacturers,setAvailableManufacturers]=useState<{id:string;name:string}[]>([]);
  const [manufacturerIds,setManufacturerIds]=useState<string[]>([]);
  const [newBrandName,setNewBrandName]=useState(""); const [addingBrand,setAddingBrand]=useState(false); const [brandError,setBrandError]=useState("");
  function toggleManufacturer(id:string){setManufacturerIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
  async function addNewBrand(){const name=newBrandName.trim();if(!name)return;setAddingBrand(true);setBrandError("");try{const r=await fetch("/api/v1/master-data/manufacturers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||"Unable to add brand.");setAvailableManufacturers(list=>[...list,{id:b.id,name:b.name}]);setManufacturerIds(ids=>[...ids,b.id]);setNewBrandName("");}catch(e){setBrandError(e instanceof Error?e.message:"Unable to add brand.");}finally{setAddingBrand(false);}}
  // 2026-10-06 — user report: "Suppliers table, when clicking edit it doesnt
  // allow to edit all details". The Edit drawer used to be scalar-only
  // (name, VAT, phone ...) while addresses, contacts and brands could only be
  // changed from the supplier's own page. Edit now loads the record's full
  // detail and shows the same Address / Contacts / Brands tabs as New, plus
  // payment terms (and default tax code / account on hold for customers).
  // Saving PATCHes the scalars, then syncs the child lists through the same
  // endpoints the detail page uses (POST new, PATCH changed, DELETE =
  // deactivate for rows removed here, PUT brands/{id} per added/removed brand).
  const [editAddresses,setEditAddresses]=useState<AddrEditRow[]>([]); const nextAddrKey=useRef(1); const [detailLoading,setDetailLoading]=useState(false); const [origBrandIds,setOrigBrandIds]=useState<string[]>([]); const [origContactIds,setOrigContactIds]=useState<string[]>([]); const [origAddressIds,setOrigAddressIds]=useState<string[]>([]);
  const [paymentTerms,setPaymentTerms]=useState<{id:string;label:string}[]>([]); const [taxCodes,setTaxCodes]=useState<{id:string;label:string}[]>([]);
  function blankAddrRow():AddrEditRow{return{key:`new-${nextAddrKey.current++}`,type:"BILLING",label:"",line1:"",line2:"",city:"",province:"",postalCode:"",countryCode:"ZA",isPrimary:false,branchId:null};}
  function updateAddrRow(key:string,patch:Partial<AddrEditRow>){setEditAddresses(rows=>rows.map(r=>r.key===key?{...r,...patch}:r));}
  async function loadEditDetail(id:string){
    setDetailLoading(true);
    try{
      const r=await fetch(`/api/v1/${config.kind}/${id}`,{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error?.message||"Unable to load details.");
      const cs:ContactRow[]=((b.contacts||[]) as Array<Record<string,unknown>>).filter(c=>c.active!==false).map(c=>{const row:ContactRow={id:`srv-${str(c.id)}`,serverId:str(c.id),firstName:str(c.firstName),lastName:str(c.lastName),position:str(c.position),telephone:str(c.telephone),mobile:str(c.mobile),email:str(c.email),isPrimary:Boolean(c.isPrimary),canReceiveRfq:Boolean(c.canReceiveRfq),notes:(c.notes as string|null|undefined)??null,branchId:(c.branchId as string|null|undefined)??null};row.orig=JSON.stringify(contactPayload(row));return row;});
      const as:AddrEditRow[]=((b.addresses||[]) as Array<Record<string,unknown>>).filter(a=>a.active!==false).map(a=>{const row:AddrEditRow={key:`srv-${str(a.id)}`,serverId:str(a.id),type:str(a.type)||"BILLING",label:str(a.label),line1:str(a.line1),line2:str(a.line2),city:str(a.city),province:str(a.province),postalCode:str(a.postalCode),countryCode:str(a.countryCode)||"ZA",isPrimary:Boolean(a.isPrimary),branchId:(a.branchId as string|null|undefined)??null};row.orig=JSON.stringify(addressPayload(row));return row;});
      const bs=((b.manufacturers||[]) as Array<Record<string,unknown>>).filter(m=>m.active!==false).map(m=>str(m.manufacturerId));
      setContacts(cs);setOrigContactIds(cs.map(c=>c.serverId!));setEditAddresses(as);setOrigAddressIds(as.map(a=>a.serverId!));setManufacturerIds(bs);setOrigBrandIds(bs);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load details.");}
    finally{setDetailLoading(false);}
  }
  const load=useCallback(async()=>{setLoading(true);setError("");try{const p=new URLSearchParams({q,status,page:String(page),pageSize:"25"});const r=await fetch(`/api/v1/master-data/${config.kind}?${p}`,{cache:"no-store"});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to load records.");setData(body);}catch(e){setError(e instanceof Error?e.message:"Unable to load records.");}finally{setLoading(false);}},[config.kind,page,q,status]);
  useEffect(()=>{const t=setTimeout(load,200);return()=>clearTimeout(t);},[load]);
  useEffect(()=>{writeListState(`master-data.${config.kind}`,{q,status,page});},[config.kind,q,status,page]);
  const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
  function show(row?:Record<string,unknown>&{id:string}){setEditing(row||null);if(!row){setAddress(BLANK_ADDRESS);setContacts(contactField?[blankContactRow()]:[]);setManufacturerIds([]);setNewBrandName("");setBrandError("");if(manufacturerField)fetch("/api/v1/master-data/manufacturers?status=active&pageSize=200").then(r=>r.json()).then(b=>setAvailableManufacturers((b.items||[]).map((m:{id:string;name:string})=>({id:m.id,name:m.name})))).catch(()=>{});}if(row){setError("");setBrandError("");setNewBrandName("");setContacts([]);setEditAddresses([]);setManufacturerIds([]);if(addressField||contactField||manufacturerField)void loadEditDetail(row.id);if(manufacturerField)fetch("/api/v1/master-data/manufacturers?status=active&pageSize=200").then(r=>r.json()).then(b=>setAvailableManufacturers((b.items||[]).map((m:{id:string;name:string})=>({id:m.id,name:m.name})))).catch(()=>{});}
    if(scalarFields.some(f=>f.type==="payment-term")&&paymentTerms.length===0)fetch("/api/v1/master-data/commercial-terms?status=active&pageSize=200").then(r=>r.json()).then(b=>setPaymentTerms(((b.items||[]) as Array<{id:string;type:string;label:string;code:string}>).filter(t=>t.type==="PAYMENT").map(t=>({id:t.id,label:t.label||t.code})))).catch(()=>{});
    if(scalarFields.some(f=>f.type==="tax-code")&&taxCodes.length===0)fetch("/api/v1/master-data/tax-codes?status=active&pageSize=200").then(r=>r.json()).then(b=>setTaxCodes(((b.items||[]) as Array<{id:string;code:string;description:string}>).map(t=>({id:t.id,label:`${t.code} — ${t.description}`})))).catch(()=>{});
    setFormTab("details");setOpen(true);}
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError("");const fd=new FormData(e.currentTarget);const payload:Record<string,unknown>={};for(const f of scalarFields){const raw=fd.get(f.key);if(f.type==="checkbox")payload[f.key]=raw==="on";else if(f.type==="number")payload[f.key]=raw===""?null:Number(raw);else payload[f.key]=raw===""?null:raw;}if(!editing){if(addressField)payload[addressField.key]=address;if(contactField)payload[contactField.key]=contacts.map(({id,...rest})=>rest);if(manufacturerField)payload[manufacturerField.key]=manufacturerIds;}
    // Edit mode: validate the child rows up front so nothing is half-saved for a typo.
    if(editing){
      if(detailLoading){setError("Still loading this record's contacts, addresses and brands — try again in a moment.");setSaving(false);return;}
      const badContact=contacts.find(c=>!contactBlank(c)&&!c.firstName.trim());
      if(badContact){setFormTab("contacts");setError("Every contact needs a first name.");setSaving(false);return;}
      const badAddr=editAddresses.find(a=>!addressBlank(a)&&!a.line1.trim());
      if(badAddr){setFormTab("address");setError("Every address needs an address line 1.");setSaving(false);return;}
    }
    try{const r=await fetch(`/api/v1/master-data/${config.kind}${editing?`/${editing.id}`:""}`,{method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to save.");
      if(editing){
        const failures:string[]=[];
        const base=`/api/v1/${config.kind}/${editing.id}`;
        const call=async(label:string,url:string,method:string,data?:unknown)=>{try{const rr=await fetch(url,{method,headers:{"content-type":"application/json"},body:data===undefined?undefined:JSON.stringify(data)});if(!rr.ok){const bb=await rr.json().catch(()=>({}));failures.push(`${label}: ${bb.error?.message||"failed"}`);}}catch{failures.push(`${label}: failed`);}};
        if(contactField){
          for(const c of contacts){if(contactBlank(c))continue;const data=contactPayload(c);if(c.serverId){if(JSON.stringify(data)!==c.orig)await call(`Contact ${c.firstName}`,`${base}/contacts/${c.serverId}`,"PATCH",data);}else await call(`Contact ${c.firstName}`,`${base}/contacts`,"POST",data);}
          for(const id of origContactIds)if(!contacts.some(c=>c.serverId===id))await call("Remove contact",`${base}/contacts/${id}`,"DELETE");
        }
        if(addressField){
          for(const a of editAddresses){if(addressBlank(a))continue;const data=addressPayload(a);if(a.serverId){if(JSON.stringify(data)!==a.orig)await call(`Address ${a.line1}`,`${base}/addresses/${a.serverId}`,"PATCH",data);}else await call(`Address ${a.line1}`,`${base}/addresses`,"POST",data);}
          for(const id of origAddressIds)if(!editAddresses.some(a=>a.serverId===id))await call("Remove address",`${base}/addresses/${id}`,"DELETE");
        }
        if(manufacturerField){
          for(const id of manufacturerIds)if(!origBrandIds.includes(id))await call("Add brand",`${base}/brands/${id}`,"PUT",{active:true});
          for(const id of origBrandIds)if(!manufacturerIds.includes(id))await call("Remove brand",`${base}/brands/${id}`,"PUT",{active:false});
        }
        if(failures.length){await loadEditDetail(editing.id);await load();throw new Error(`The main details were saved, but some changes were not: ${failures.join("; ")}`);}
      }
      setOpen(false);await load();}catch(e){setError(e instanceof Error?e.message:"Unable to save.");}finally{setSaving(false);}}
  // 2026-09-10 — per-row delete (Manufacturers, Storage Locations — see
  // config.deletable in ui-config.ts). Mirrors StockLevelsWorkspace's own
  // deleteRow: the backend (deleteMasterRecord in master-data/service.ts)
  // tries a real delete first and only falls back to marking the record
  // inactive if something else still references it, so the confirm text
  // says that up front rather than the UI claiming an unconditional delete.
  async function removeRow(row:Record<string,unknown>&{id:string}){const label=String(row.name??row.code??config.singular);if(!confirm(`Delete ${label}? If it's still referenced elsewhere (for example by parts or stock history) it can't actually be removed — it'll be marked inactive instead.`))return;setRowBusy(row.id);setError("");try{const r=await fetch(`/api/v1/master-data/${config.kind}/${row.id}`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to delete.");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to delete.");}finally{setRowBusy(null);}}
  // 2026-10-02 — user request: "create a bulk delete button" (Storage
  // Locations). Mirrors removeRow above and Stock Levels' own "Delete
  // all" for Parts: hits the same DELETE on the plural endpoint, now
  // wired to deleteAllMasterRecords for this kind (see [kind]/route.ts),
  // same per-record hard-delete-then-fallback-to-inactive behavior as a
  // single row, just across every active record of this kind at once.
  async function removeAll(){if(!confirm(`Delete all ${data.total} ${config.title.toLowerCase()}? Any still referenced elsewhere (for example by parts or stock history) can't actually be removed — those are kept as inactive instead.`))return;setDeletingAll(true);setError("");try{const r=await fetch(`/api/v1/master-data/${config.kind}`,{method:"DELETE"});const body=await r.json();if(!r.ok)throw new Error(body.error?.message||"Unable to delete all.");setPage(1);await load();}catch(e){setError(e instanceof Error?e.message:"Unable to delete all.");}finally{setDeletingAll(false);}}
  // 2026-09-10 — hideHeader lets a page that already renders its own
  // eyebrow/h1 above the shared settings tab bar (tax-codes, commercial-
  // terms, numbering — see their page.tsx files) skip this component's own
  // internal page-header, so the tab bar reads as "below the page heading"
  // the same way it does on every other Settings destination instead of
  // sitting above a second, duplicate-looking heading. The "New X" action
  // just moves into the toolbar row in that case, rather than disappearing.
  return <>{!hideHeader && <header className="page-header master-header"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div><button className="gold-button" onClick={()=>show()}><Plus size={15}/> New {config.singular}</button></header>}
    <section className="master-panel"><div className="master-toolbar"><label className="search-control"><Search size={15}/><input aria-label={`Search ${config.title}`} value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder={`Search ${config.title.toLowerCase()}…`}/></label><select aria-label="Status filter" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option></select>{config.mergeable&&<button type="button" className="quiet-button" onClick={()=>{resetMerge();setShowMerge(true);}}>Merge {config.singular.toLowerCase()}s</button>}{config.deletable&&<button type="button" className="quiet-button danger" disabled={deletingAll||data.total===0} onClick={()=>void removeAll()}>{deletingAll?<Loader2 className="spin" size={14}/>:<Trash2 size={14}/>} Delete all</button>}<span>{data.total} record{data.total===1?"":"s"}</span>{hideHeader && <button className="gold-button" onClick={()=>show()}><Plus size={15}/> New {config.singular}</button>}</div>
      {error&&<div className="inline-error">{error}</div>}{loading?<div className="table-state"><Loader2 className="spin" size={20}/>Loading…</div>:data.items.length===0?<div className="table-state">No matching records. Create the first {config.singular.toLowerCase()} when ready.</div>:<div className="data-table-wrap"><table className="data-table"><thead><tr>{config.columns.map(c=><th key={c.key}>{c.label}</th>)}<th>Status</th><th></th></tr></thead><tbody>{data.items.map(row=><tr key={row.id}>{config.columns.map(c=><td key={c.key}>{formatValue(valueAt(row,c.key),c.format)}</td>)}<td><span className={`status-pill ${row.active===false?"neutral":""}`}>{row.active===false?"Inactive":"Active"}</span></td><td>{config.detailBasePath?<Link className="table-action" href={`${config.detailBasePath}/${row.id}`}>View</Link>:null}<button className="table-action" onClick={()=>show(row)}>Edit</button>{config.deletable&&<button type="button" className="table-action danger" disabled={rowBusy===row.id} onClick={()=>void removeRow(row)}>{rowBusy===row.id?<Loader2 className="spin" size={14}/>:<Trash2 size={14}/>}</button>}</td></tr>)}</tbody></table></div>}
      <footer className="table-footer"><span>Page {data.page} of {pages}</span><div><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button></div></footer>
      {/* 2026-09-15, user request: "Back button to take you back to where
          you last were." Only mounted once the list has actually rendered
          — see ScrollRestore's own comment for why. */}
      {!loading && <ScrollRestore selector=".master-panel .data-table-wrap" storageKey={`master-data.${config.kind}`} />}
    </section>
    {open&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><aside className="form-drawer wide-drawer" aria-modal="true"><header><div><p className="eyebrow">Master data</p><h2>{editing?"Edit":"New"} {config.singular}</h2></div><button aria-label="Close" onClick={()=>setOpen(false)}><X size={18}/></button></header><form onSubmit={submit}>
      {showTabs&&<nav className="detail-tabs form-tab-nav"><button type="button" className={formTab==="details"?"active":""} onClick={()=>setFormTab("details")}>Details</button>{addressField&&<button type="button" className={formTab==="address"?"active":""} onClick={()=>setFormTab("address")}>Address</button>}{contactField&&<button type="button" className={formTab==="contacts"?"active":""} onClick={()=>setFormTab("contacts")}>Contacts</button>}{manufacturerField&&<button type="button" className={formTab==="brands"?"active":""} onClick={()=>setFormTab("brands")}>{manufacturerField.label}{manufacturerIds.length>0?` (${manufacturerIds.length})`:""}</button>}</nav>}
      <div className="drawer-fields" hidden={showTabs&&formTab!=="details"}>{scalarFields.map(f=><label key={f.key} className={f.type==="textarea"?"wide":""}>{f.type==="checkbox"?<><input name={f.key} type="checkbox" defaultChecked={editing?Boolean(editing[f.key]):f.key==="active"}/><span>{f.label}</span></>:<><span>{f.label}{f.required&&" *"}</span>{f.type==="payment-term"||f.type==="tax-code"?<select key={`${f.type}-${f.type==="payment-term"?paymentTerms.length:taxCodes.length}`} name={f.key} defaultValue={String(editing?.[f.key]??"")}><option value="">None</option>{(f.type==="payment-term"?paymentTerms:taxCodes).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>:f.type==="select"?<select name={f.key} required={f.required} defaultValue={String(editing?.[f.key]??"")}><option value="">Select…</option>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:f.type==="textarea"?<textarea name={f.key} defaultValue={String(editing?.[f.key]??"")} rows={4}/>:<input name={f.key} type={f.type||"text"} required={f.required} step={f.type==="number"?"0.0001":undefined} defaultValue={String(editing?.[f.key]??"")} placeholder={f.placeholder}/>}</>}</label>)}</div>

      {addressField&&editing&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="address"}><header><div><h2>Addresses</h2><p>Edit, add or remove addresses. Removing one deactivates it (same as on the {config.singular.toLowerCase()}&apos;s own page).</p></div><button type="button" className="quiet-button" onClick={()=>setEditAddresses(rows=>[...rows,blankAddrRow()])}><Plus size={14}/> Add address</button></header>{detailLoading?<div className="table-state"><Loader2 className="spin" size={16}/>Loading…</div>:editAddresses.length===0?<p className="muted small-line">No addresses recorded.</p>:<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Address line 1</th><th>Address line 2</th><th>City</th><th>Province</th><th>Postal code</th><th>Primary</th><th></th></tr></thead><tbody>{editAddresses.map(row=><tr key={row.key}><td><select value={row.type} onChange={e=>updateAddrRow(row.key,{type:e.target.value})}>{ADDRESS_TYPE_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></td><td><input value={row.line1} onChange={e=>updateAddrRow(row.key,{line1:e.target.value})} placeholder="Street address"/></td><td><input value={row.line2} onChange={e=>updateAddrRow(row.key,{line2:e.target.value})}/></td><td><input value={row.city} onChange={e=>updateAddrRow(row.key,{city:e.target.value})}/></td><td><input value={row.province} onChange={e=>updateAddrRow(row.key,{province:e.target.value})}/></td><td><input value={row.postalCode} onChange={e=>updateAddrRow(row.key,{postalCode:e.target.value})}/></td><td><input type="checkbox" checked={row.isPrimary} onChange={e=>updateAddrRow(row.key,{isPrimary:e.target.checked})}/></td><td><button type="button" className="table-action danger" onClick={()=>setEditAddresses(rows=>rows.filter(r=>r.key!==row.key))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}</section>}
      {addressField&&!editing&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="address"}><header><div><h2>{addressField.label}</h2><p>Optional — leave the address line blank to skip it and add one later.</p></div></header><div className="drawer-fields"><label><span>Address type</span><select value={address.type} onChange={e=>setAddress(a=>({...a,type:e.target.value}))}>{ADDRESS_TYPE_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label><span>Address line 1</span><input value={address.line1} onChange={e=>setAddress(a=>({...a,line1:e.target.value}))} placeholder="Street address"/></label><label><span>Address line 2</span><input value={address.line2} onChange={e=>setAddress(a=>({...a,line2:e.target.value}))}/></label><label><span>City</span><input value={address.city} onChange={e=>setAddress(a=>({...a,city:e.target.value}))}/></label><label><span>Province</span><input value={address.province} onChange={e=>setAddress(a=>({...a,province:e.target.value}))}/></label><label><span>Postal code</span><input value={address.postalCode} onChange={e=>setAddress(a=>({...a,postalCode:e.target.value}))}/></label></div></section>}

      {contactField&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="contacts"}><header><div><h2>{contactField.label}</h2><p>{editing?"Edit, add or remove contacts. Removing one deactivates it.":"Add one or more contacts now, or leave blank and add them later."}</p></div><button type="button" className="quiet-button" onClick={addContactRow}><Plus size={14}/> Add contact</button></header>{detailLoading&&editing?<div className="table-state"><Loader2 className="spin" size={16}/>Loading…</div>:contacts.length===0?<p className="muted small-line">No contacts added yet.</p>:<div className="data-table-wrap"><table className="data-table"><thead><tr><th>First name</th><th>Surname</th><th>Position</th><th>Email</th><th>Telephone</th><th>Mobile</th><th>Primary</th>{contactField.contactRfqToggle&&<th>Can receive RFQs</th>}<th></th></tr></thead><tbody>{contacts.map(row=><tr key={row.id}><td><input value={row.firstName} onChange={e=>updateContactRow(row.id,{firstName:e.target.value})} placeholder="First name"/></td><td><input value={row.lastName} onChange={e=>updateContactRow(row.id,{lastName:e.target.value})} placeholder="Surname"/></td><td><input value={row.position} onChange={e=>updateContactRow(row.id,{position:e.target.value})} placeholder="Position"/></td><td><input type="email" value={row.email} onChange={e=>updateContactRow(row.id,{email:e.target.value})} placeholder="Email"/></td><td><input value={row.telephone} onChange={e=>updateContactRow(row.id,{telephone:e.target.value})} placeholder="Telephone"/></td><td><input value={row.mobile} onChange={e=>updateContactRow(row.id,{mobile:e.target.value})} placeholder="Mobile"/></td><td><input type="checkbox" checked={row.isPrimary} onChange={e=>updateContactRow(row.id,{isPrimary:e.target.checked})}/></td>{contactField.contactRfqToggle&&<td><input type="checkbox" checked={row.canReceiveRfq} onChange={e=>updateContactRow(row.id,{canReceiveRfq:e.target.checked})}/></td>}<td><button type="button" className="table-action danger" onClick={()=>removeContactRow(row.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}</section>}

      {manufacturerField&&<section className="detail-panel inner-panel" hidden={showTabs&&formTab!=="brands"}><header><div><h2>{manufacturerField.label}</h2><p>Select which manufacturers/brands this supplier can supply — used by procurement and RFQs. Optional.</p></div></header>
        {availableManufacturers.length===0?<p className="muted small-line">No manufacturers on file yet — add the first one below.</p>:<div className="module-pill-grid" style={{padding:"0 14px"}}>{availableManufacturers.map(m=><button key={m.id} type="button" className={`module-pill${manufacturerIds.includes(m.id)?" selected":""}`} onClick={()=>toggleManufacturer(m.id)}>{manufacturerIds.includes(m.id)&&<span>✓</span>}{m.name}</button>)}</div>}
        <div className="drawer-fields" style={{gridTemplateColumns:"1fr auto",paddingTop:10}}>
          <label><span>Add a new brand</span><input value={newBrandName} onChange={e=>setNewBrandName(e.target.value)} placeholder="e.g. Bosch" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void addNewBrand();}}}/></label>
          <button type="button" className="quiet-button" style={{alignSelf:"end"}} disabled={addingBrand||!newBrandName.trim()} onClick={()=>void addNewBrand()}>{addingBrand?<Loader2 className="spin" size={14}/>:<Plus size={14}/>} Add brand</button>
        </div>
        {brandError&&<div className="inline-error">{brandError}</div>}
      </section>}

      {error&&<div className="inline-error" style={{margin:"0 14px"}}>{error}</div>}
      <footer><button type="button" className="quiet-button" onClick={()=>setOpen(false)}>Cancel</button><button className="gold-button" disabled={saving||(Boolean(editing)&&detailLoading)}>{saving?<Loader2 className="spin" size={15}/>:null}{saving?"Saving…":"Save"}</button></footer></form></aside></div>}
    {showMerge&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowMerge(false)}}><aside className="form-drawer" aria-modal="true">
      <header><div><p className="eyebrow">{config.title}</p><h2>Merge {config.singular.toLowerCase()}s</h2></div><button aria-label="Close" onClick={()=>setShowMerge(false)}><X size={18}/></button></header>
      <div className="drawer-fields">
        {/* 2026-09-28 — manufacturers has neither jobs, contacts nor
            addresses (it's parts + supplier brand links, see
            mergeManufacturers), so the generic customers/suppliers wording
            below would just be wrong for it rather than merely vague. */}
        <p className="muted small-line wide">{config.kind==="manufacturers"
          ? `Pick the manufacturer to keep, and the one to merge into it. Every part and supplier brand link pointing at the second record moves to the first, and the second is then deactivated (not deleted).`
          : `Pick the ${config.singular.toLowerCase()} to keep, and the one to merge into it. Everything on the second record — jobs, contacts, addresses, ${config.kind==="suppliers"?"RFQs, outwork, ":""}history — moves to the first, and the second is then deactivated (not deleted).`}</p>
        <label className="party-selector" onBlur={closeDropdownUnlessWithin(()=>setKeepOptions([]))}><span>Keep this {config.singular.toLowerCase()}</span><div><Search size={15}/><input value={keepQuery} onChange={e=>{setKeepQuery(e.target.value);setKeepId("")}} placeholder={`Search ${config.title.toLowerCase()}…`}/></div>{keepOptions.length>0&&<div className="selector-results">{keepOptions.map(o=><button key={o.id} type="button" onClick={()=>{setKeepId(o.id);setKeepQuery(o.name);setKeepOptions([])}}><strong>{o.name}</strong></button>)}</div>}</label>
        <label className="party-selector" onBlur={closeDropdownUnlessWithin(()=>setAwayOptions([]))}><span>Merge this {config.singular.toLowerCase()} in (deactivated afterwards)</span><div><Search size={15}/><input value={awayQuery} onChange={e=>{setAwayQuery(e.target.value);setAwayId("")}} placeholder={`Search ${config.title.toLowerCase()}…`}/></div>{awayOptions.length>0&&<div className="selector-results">{awayOptions.map(o=><button key={o.id} type="button" onClick={()=>{setAwayId(o.id);setAwayQuery(o.name);setAwayOptions([])}}><strong>{o.name}</strong></button>)}</div>}</label>
        {keepId&&awayId&&keepId===awayId&&<div className="inline-error">Pick two different {config.title.toLowerCase()}.</div>}
        {mergeError&&<div className="inline-error">{mergeError}</div>}
      </div>
      <footer><button type="button" className="quiet-button" onClick={()=>setShowMerge(false)}>Cancel</button><button className="gold-button" disabled={merging||!keepId||!awayId||keepId===awayId} onClick={()=>void submitMerge()}>{merging?<Loader2 className="spin" size={15}/>:null}{merging?"Merging…":"Merge"}</button></footer>
    </aside></div>}</>;
}
