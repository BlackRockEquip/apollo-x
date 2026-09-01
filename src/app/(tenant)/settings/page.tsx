import Link from "next/link";
import{CompanySettingsForm}from"@/components/CompanySettingsForm";
export default function Page(){return <><header className="page-header compact"><div><p className="eyebrow">Company Settings</p><h1>Company Settings</h1><p>Maintain company details, defaults and document branding.</p></div><div className="header-tabs"><Link href="/tax-codes" className="quiet-button">Tax Codes</Link><Link href="/commercial-terms" className="quiet-button">Commercial Terms</Link></div></header><CompanySettingsForm/></>}
