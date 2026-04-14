/**
 * Seed the RBI database with sample frameworks, master directions, and circulars.
 *
 * Usage:
 *   npx tsx scripts/seed-sample.ts
 *   npx tsx scripts/seed-sample.ts --force
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

const DB_PATH = process.env["RBI_DB_PATH"] ?? "data/rbi.db";
const force = process.argv.includes("--force");

const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
if (force && existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log(`Deleted ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);
console.log(`Database initialised at ${DB_PATH}`);

// --- Frameworks ---------------------------------------------------------------

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  domain: string;
  description: string;
  control_count: number;
  effective_date: string;
  pdf_url: string;
}

const frameworks: FrameworkRow[] = [
  {
    id: "rbi-csf",
    name: "RBI Cyber Security Framework for Banks",
    version: "2016 (updated 2021)",
    domain: "Cybersecurity",
    description:
      "The RBI Cyber Security Framework for Banks establishes a baseline set of cybersecurity controls " +
      "that all scheduled commercial banks must implement. It covers cyber crisis management, SOC setup, " +
      "network and database security, customer protection, and IT risk governance. Originally issued in " +
      "2016 via circular RBI/2015-16/418 and subsequently updated through master directions. Aligns " +
      "with NIST CSF and ISO 27001.",
    control_count: 52,
    effective_date: "2016-06-02",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=10435&Mode=0",
  },
  {
    id: "rbi-itgr",
    name: "Master Direction on IT Governance, Risk Management, Controls & Assurance Practices",
    version: "2023",
    domain: "IT Governance",
    description:
      "The RBI Master Direction on IT Governance (2023) sets comprehensive requirements for IT governance, " +
      "risk management, information security, and assurance across regulated entities (REs). It covers " +
      "board-level IT oversight, CISO accountability, IT risk integration, cyber incident reporting within " +
      "6 hours to RBI CERT-In, third-party and cloud risk management, and audit requirements. Supersedes " +
      "earlier IT framework circulars. Applicable to all scheduled commercial banks, urban cooperative " +
      "banks, and NBFCs above threshold.",
    control_count: 76,
    effective_date: "2023-04-01",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12549&Mode=0",
  },
  {
    id: "rbi-dpsc",
    name: "Master Direction on Digital Payment Security Controls",
    version: "2021 (updated 2024)",
    domain: "Digital Payments",
    description:
      "The RBI Master Direction on Digital Payment Security Controls (2021, updated 2024) prescribes " +
      "security requirements for mobile and internet banking, payment aggregators, prepaid instruments, " +
      "and card networks. Covers device binding, transaction monitoring, fraud prevention, customer " +
      "authentication (AFA mandatory), tokenisation, and grievance redress. Applies to all Payment " +
      "System Operators (PSOs) and regulated entities offering digital payment services.",
    control_count: 44,
    effective_date: "2021-02-18",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12032&Mode=0",
  },
];

const insertFramework = db.prepare(
  "INSERT OR IGNORE INTO frameworks (id, name, version, domain, description, control_count, effective_date, pdf_url) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const f of frameworks) {
  insertFramework.run(
    f.id, f.name, f.version, f.domain, f.description, f.control_count, f.effective_date, f.pdf_url,
  );
}
console.log(`Inserted ${frameworks.length} frameworks`);

// --- Master Directions / Controls ---------------------------------------------

interface ControlRow {
  framework_id: string;
  control_ref: string;
  domain: string;
  subdomain: string;
  title: string;
  description: string;
  maturity_level: string;
  priority: string;
}

const controls: ControlRow[] = [
  // RBI Cyber Security Framework for Banks
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-1.1",
    domain: "Cyber Crisis Management",
    subdomain: "Governance",
    title: "Cyber Crisis Management Plan",
    description:
      "Every bank must prepare a Cyber Crisis Management Plan (CCMP) addressing detection, response, recovery, " +
      "and containment of cyber incidents. The CCMP must be approved by the Board and reviewed annually. " +
      "Significant cyber incidents must be reported to RBI within 2-6 hours of detection (per updated 2021 direction) " +
      "and to CERT-In as required under CERT-In Directions 2022. Banks must conduct tabletop exercises testing " +
      "the CCMP at least annually and share results with RBI on request.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-1.2",
    domain: "Cyber Crisis Management",
    subdomain: "Incident Response",
    title: "Cyber Incident Reporting to RBI",
    description:
      "Banks must report all unusual cyber incidents, including ATM/POS attacks, data breaches, ransomware, " +
      "and SWIFT-related frauds to RBI within 2-6 hours of detection. A preliminary report must be submitted " +
      "within 6 hours followed by a detailed root cause analysis report within 14 days. The reporting format " +
      "is prescribed by RBI. Failure to report within timelines is treated as a compliance violation. CERT-In " +
      "must also be notified of incidents covered under CERT-In Directions 2022 within 6 hours.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-2.1",
    domain: "SOC Setup",
    subdomain: "Security Operations",
    title: "Security Operations Centre",
    description:
      "Banks above prescribed thresholds must establish a Security Operations Centre (SOC) providing 24x7 " +
      "monitoring of security events. The SOC must have capabilities for threat intelligence integration, " +
      "log aggregation and correlation (SIEM), vulnerability scanning, and incident escalation. Smaller banks " +
      "may use shared SOC services with RBI approval. SOC must cover all critical systems including core " +
      "banking, internet banking, SWIFT, ATM network, and payment gateways. Minimum log retention: 2 years " +
      "online, 5 years archived, consistent with CERT-In Directions 2022.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-2.2",
    domain: "SOC Setup",
    subdomain: "Security Operations",
    title: "Threat Intelligence and Vulnerability Management",
    description:
      "Banks must subscribe to threat intelligence feeds including RBI-CSITE advisories, CERT-In alerts, " +
      "and sector-specific threat sharing platforms. Vulnerability scans must be conducted on all " +
      "internet-facing systems monthly and all internal systems quarterly. Critical vulnerabilities must be " +
      "patched within 30 days; high within 60 days. Penetration testing by CERT-In empanelled auditors " +
      "is mandatory annually for critical systems. Red team exercises must be conducted for systemically " +
      "important banks (SIBs).",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-3.1",
    domain: "Customer Protection",
    subdomain: "Fraud Management",
    title: "Customer Data Protection and Fraud Prevention",
    description:
      "Banks must implement controls to protect customer data throughout its lifecycle. Customer authentication " +
      "for internet banking must use Additional Factor Authentication (AFA) for all transactions above INR 10,000. " +
      "Real-time transaction monitoring with automated fraud detection must cover all digital channels. " +
      "Customers must be notified of all transactions above INR 5,000 via SMS/email within 5 minutes. " +
      "Zero-liability protection applies where fraud occurs without customer negligence. Banks must maintain " +
      "a 24x7 customer helpline for fraud reporting.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-3.2",
    domain: "Customer Protection",
    subdomain: "Mobile Banking Security",
    title: "Mobile Banking Security Requirements",
    description:
      "Mobile banking applications must implement device binding, certificate pinning, and application shielding " +
      "to prevent tampering and reverse engineering. Root/jailbreak detection must block access on compromised " +
      "devices. Session tokens must expire within 5 minutes of inactivity. AFA is mandatory for all financial " +
      "transactions. OTP validity must not exceed 30 seconds for high-value transactions. Banks must implement " +
      "malware detection capabilities in mobile applications. Push notifications for transactions are mandatory.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-4.1",
    domain: "Vendor Risk Management",
    subdomain: "Third-Party Security",
    title: "IT Vendor and Outsourcing Security",
    description:
      "Banks must conduct security due diligence of all IT vendors and outsourced service providers before " +
      "onboarding and annually thereafter. Contracts must include security requirements, audit rights, incident " +
      "notification within 6 hours, data localisation obligations, and right to terminate on security grounds. " +
      "Banks remain accountable for regulatory compliance regardless of outsourcing. Critical IT outsourcing " +
      "requires RBI prior approval. Sub-contracting of critical functions requires bank approval. Offshore " +
      "data storage/processing requires explicit RBI permission.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-csf",
    control_ref: "RBI-CSF-5.1",
    domain: "Network and Database Security",
    subdomain: "Infrastructure Security",
    title: "Network Security Architecture",
    description:
      "Banks must implement segmented network architecture with defined security zones: internet-facing DMZ, " +
      "banking application zone, core banking zone, and management zone. Firewalls with documented and reviewed " +
      "rule sets must segregate zones. All external connectivity must terminate at monitored ingress points. " +
      "Database activity monitoring (DAM) is mandatory for all databases holding customer or financial data. " +
      "Privileged access to production systems must use jump servers with session recording. Network traffic " +
      "must be inspected for anomalies using IDS/IPS.",
    maturity_level: "Baseline",
    priority: "High",
  },

  // IT Governance Master Direction (2023)
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-1.1",
    domain: "IT Governance",
    subdomain: "Board and Senior Management",
    title: "Board-Level IT Governance",
    description:
      "The Board of Directors of every regulated entity (RE) must constitute an IT Strategy Committee (ITSC) " +
      "or equivalent sub-committee with at least one independent director having IT/cybersecurity expertise. " +
      "The ITSC must meet quarterly and review IT risks, cybersecurity posture, major projects, and technology " +
      "resilience. The Board must approve the IT strategy, IT risk appetite, and significant technology " +
      "investments above prescribed thresholds. Board-approved IT policies must be reviewed at least annually.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-1.2",
    domain: "IT Governance",
    subdomain: "CISO Accountability",
    title: "Chief Information Security Officer",
    description:
      "Every RE must designate a Chief Information Security Officer (CISO) who reports directly to the MD/CEO " +
      "or equivalent and has access to the Board. The CISO must not hold dual responsibility for IT operations " +
      "or business lines. The CISO is accountable for information security strategy, policy, and compliance. " +
      "CISO must submit a quarterly report to the IT Strategy Committee covering the security posture, " +
      "incidents, vulnerabilities, and compliance gaps. REs below prescribed thresholds may designate a " +
      "senior IT officer as CISO.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-2.1",
    domain: "IT Risk Management",
    subdomain: "Risk Framework",
    title: "IT Risk Management Framework",
    description:
      "REs must integrate IT risk into the enterprise risk management framework. A formal IT risk assessment " +
      "must be conducted at least annually covering all critical systems, applications, and technology " +
      "dependencies. IT risk assessments must evaluate confidentiality, integrity, and availability risks. " +
      "Risk appetite statements for IT/cyber risk must be board-approved. Material IT risks must be reported " +
      "to the Board quarterly. Risk treatment plans with owners and timelines must be maintained and tracked " +
      "to closure.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-2.2",
    domain: "IT Risk Management",
    subdomain: "Change Management",
    title: "IT Change and Release Management",
    description:
      "REs must maintain formal change management processes covering all changes to production systems. " +
      "Emergency changes must follow an expedited approval process with post-implementation review. Changes " +
      "to critical banking systems (core banking, payment systems, internet/mobile banking) require CISO " +
      "sign-off before deployment. Change records must be retained for at least 5 years. Security testing " +
      "including regression and penetration testing is mandatory before major releases. Rollback procedures " +
      "must be documented and tested for all significant changes.",
    maturity_level: "Baseline",
    priority: "Medium",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-3.1",
    domain: "Cloud and Outsourcing",
    subdomain: "Cloud Security",
    title: "Cloud Computing Risk Management",
    description:
      "REs adopting cloud services must ensure data localisation — customer data of Indian residents must be " +
      "stored in India. Prior intimation to RBI is required before migrating critical systems to cloud. Cloud " +
      "service providers must agree to: RBI and statutory auditor access rights; incident notification within " +
      "6 hours; data return and deletion on termination; sub-processor restrictions. A cloud risk assessment " +
      "must be conducted before adoption and reviewed annually. Concentration risk from single-cloud dependency " +
      "must be assessed. Exit strategies must be documented and tested annually.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-4.1",
    domain: "Information Security",
    subdomain: "Access Control",
    title: "Identity and Access Management",
    description:
      "All users accessing RE systems must have unique identifiers. Privileged access must require multi-factor " +
      "authentication. Privileged account reviews must be conducted monthly; standard account reviews quarterly. " +
      "Dormant accounts must be disabled after 30 days. Privileged Access Management (PAM) solutions are " +
      "mandatory for REs above prescribed thresholds. Just-in-time access is recommended for privileged " +
      "operations. Shared accounts are prohibited except for documented exceptions with compensating controls. " +
      "Service account passwords must be rotated at least every 90 days.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-4.2",
    domain: "Information Security",
    subdomain: "Data Protection",
    title: "Data Security and Encryption",
    description:
      "REs must classify all data assets and apply controls proportionate to classification. Customer financial " +
      "data must be encrypted in transit (minimum TLS 1.2, TLS 1.3 preferred) and at rest (AES-256 or equivalent). " +
      "Encryption keys must be managed through a dedicated key management system with hardware security modules " +
      "(HSMs) for critical applications. Data masking must be applied in non-production environments. Tokenisation " +
      "of card data is mandatory for payment processing. Data loss prevention (DLP) controls must cover email, " +
      "web uploads, and removable media for systems handling customer data.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-itgr",
    control_ref: "RBI-ITGR-5.1",
    domain: "Business Continuity",
    subdomain: "Resilience",
    title: "IT Business Continuity and Disaster Recovery",
    description:
      "REs must maintain IT Business Continuity Plans (IT-BCP) covering all critical systems with defined " +
      "Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO). For systemically important payment " +
      "systems, RTO must not exceed 2 hours. Disaster recovery sites must be at a safe distance and tested " +
      "at least twice annually. Full DR drill results must be reported to the Board. Immutable backups must " +
      "be maintained offline for critical systems. Backup integrity must be tested monthly. DR arrangements " +
      "for critical payment infrastructure require RBI approval.",
    maturity_level: "Baseline",
    priority: "High",
  },

  // Digital Payment Security Controls
  {
    framework_id: "rbi-dpsc",
    control_ref: "RBI-DPSC-1.1",
    domain: "Mobile and Internet Banking Security",
    subdomain: "Authentication",
    title: "Additional Factor Authentication for Digital Payments",
    description:
      "All digital payment transactions above INR 10,000 initiated via internet banking or mobile banking " +
      "must require Additional Factor Authentication (AFA). Permissible AFA methods include OTP delivered " +
      "via SMS/email, biometric authentication, and hardware tokens. Static passwords as sole authentication " +
      "are prohibited for transactions. OTPs must be time-bound (maximum 30 seconds for high-value) and " +
      "single-use. UPI transactions are exempt where PIN is used. For transactions above INR 2 lakh, " +
      "AFA is mandatory regardless of channel. Pre-approved recurring mandates are exempted below INR 15,000.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-dpsc",
    control_ref: "RBI-DPSC-1.2",
    domain: "Mobile and Internet Banking Security",
    subdomain: "Session Security",
    title: "Session Management and Timeout Controls",
    description:
      "Internet banking sessions must timeout after 5 minutes of inactivity and require re-authentication. " +
      "Mobile banking sessions must implement device binding — binding the application to a specific device " +
      "via a unique device fingerprint. Re-registration on a new device must require full KYC verification " +
      "and AFA. Concurrent sessions from multiple devices must be restricted or flagged for review. Session " +
      "tokens must be encrypted and invalidated on logout. Applications must detect and block emulator access.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-dpsc",
    control_ref: "RBI-DPSC-2.1",
    domain: "Fraud Management",
    subdomain: "Transaction Monitoring",
    title: "Real-Time Fraud Detection and Transaction Monitoring",
    description:
      "Payment System Operators (PSOs) and payment aggregators must implement real-time transaction monitoring " +
      "using risk-based fraud detection engines. Monitoring must cover velocity checks, geographical anomalies, " +
      "device fingerprint changes, and behavioural biometrics. High-risk transactions must be subject to " +
      "step-up authentication. Disputes must be resolved within 30 days for unauthorised transactions. " +
      "PSOs must submit monthly fraud reports to RBI in the prescribed format. Card-not-present fraud " +
      "must be monitored across all channels with merchant-level analytics.",
    maturity_level: "Baseline",
    priority: "High",
  },
  {
    framework_id: "rbi-dpsc",
    control_ref: "RBI-DPSC-3.1",
    domain: "Card Security",
    subdomain: "Tokenisation",
    title: "Card Tokenisation Requirements",
    description:
      "As per RBI mandate effective October 2022, no entity in the card payment ecosystem may store actual " +
      "card data (Card-on-File / CoF data) except card issuers and card networks. Payment aggregators and " +
      "merchants must replace stored card data with tokens issued by card networks. Token provisioning requires " +
      "explicit customer consent. Card-on-file tokenisation must be implemented for all saved card scenarios " +
      "in e-commerce. The mandate applies to domestic and international card transactions processed in India. " +
      "Non-compliance attracts penalty under Payment and Settlement Systems Act 2007.",
    maturity_level: "Baseline",
    priority: "High",
  },
];

const insertControl = db.prepare(
  "INSERT OR IGNORE INTO controls " +
    "(framework_id, control_ref, domain, subdomain, title, description, maturity_level, priority) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const c of controls) {
  insertControl.run(
    c.framework_id, c.control_ref, c.domain, c.subdomain, c.title,
    c.description, c.maturity_level, c.priority,
  );
}
console.log(`Inserted ${controls.length} master directions`);

// --- Circulars ----------------------------------------------------------------

interface CircularRow {
  reference: string;
  title: string;
  date: string;
  category: string;
  summary: string;
  full_text: string;
  pdf_url: string;
  status: string;
}

const circulars: CircularRow[] = [
  {
    reference: "RBI-CIR-2023-IT-001",
    title: "Master Direction on Information Technology Governance, Risk, Controls and Assurance Practices",
    date: "2023-04-07",
    category: "IT Governance",
    summary:
      "Comprehensive master direction consolidating and updating IT governance requirements for all RBI-regulated " +
      "entities. Covers board oversight, CISO accountability, IT risk management, information security, cloud " +
      "and outsourcing risk, business continuity, and audit requirements. Effective 1 April 2024.",
    full_text:
      "RBI Master Direction on IT Governance, Risk, Controls and Assurance Practices (2023). " +
      "Reference: RBI/2023-24/xx; DoR.AUT.REC.xx/24.01.001/2023-24. " +
      "Applicability: All Scheduled Commercial Banks (excluding Regional Rural Banks), Small Finance Banks, " +
      "Payments Banks, Urban Cooperative Banks above INR 2,000 crore in assets, and NBFCs above INR 10,000 crore. " +
      "Effective Date: 1 April 2024. " +
      "Key Requirements: " +
      "(1) IT Strategy Committee — Board sub-committee with at least one independent director having IT expertise; " +
      "quarterly meetings; review of IT strategy, risks, and cybersecurity posture. " +
      "(2) CISO — Mandatory designation; reports to MD/CEO; independent of IT operations; quarterly ITSC report. " +
      "(3) IT Risk Framework — Annual IT risk assessments; integration into ERM; material risks to Board quarterly. " +
      "(4) Information Security — Multi-factor authentication for privileged access; monthly privileged account " +
      "reviews; encryption of customer data at rest (AES-256) and in transit (TLS 1.2+). " +
      "(5) Cloud and Outsourcing — Data localisation mandatory; RBI intimation before critical cloud migration; " +
      "6-hour incident notification requirement in contracts. " +
      "(6) Business Continuity — IT-BCP with defined RTO/RPO; DR testing twice annually; Board-level reporting. " +
      "(7) Audit — Annual IS audit by CERT-In empanelled auditor; findings reported to Board within 3 months.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12549&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2024-PAY-001",
    title: "Master Direction on Digital Payment Security Controls (Updated 2024)",
    date: "2024-01-15",
    category: "Digital Payments",
    summary:
      "Updates the 2021 Digital Payment Security Controls master direction to include enhanced requirements " +
      "for UPI security, CBDC security framework, and updated AFA thresholds. Applies to all Payment System " +
      "Operators and regulated entities offering digital payment services.",
    full_text:
      "RBI Master Direction on Digital Payment Security Controls — 2024 Update. " +
      "Original Direction: RBI/2020-21/84 dated 18 February 2021. " +
      "Purpose: Update security controls to address evolving threats in India's digital payment ecosystem. " +
      "Key Updates in 2024: " +
      "(1) UPI Security — Enhanced device binding requirements; limit on daily transaction volumes without " +
      "enhanced KYC; mandatory fraud analytics for UPI PSPs above prescribed thresholds. " +
      "(2) AFA Thresholds — AFA mandatory for all transactions above INR 2,000 (reduced from INR 10,000) " +
      "for new internet banking registrations; legacy users retain INR 10,000 threshold until re-registration. " +
      "(3) Recurring Payments — E-mandate for recurring payments must follow AFA and notification protocols; " +
      "pre-debit notification 24 hours before mandate execution; customer right to pause/cancel mandates. " +
      "(4) CBDC Security — Digital Rupee wallet security requirements including PIN, biometric options, " +
      "and device binding; offline CBDC transaction limits. " +
      "(5) Card Tokenisation — Full enforcement of CoF tokenisation mandate; penalties for non-compliance " +
      "clarified under PSS Act 2007. " +
      "(6) Fraud Reporting — Monthly fraud returns to RBI; real-time reporting for fraud above INR 1 crore.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12700&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2022-DL-001",
    title: "Guidelines on Digital Lending",
    date: "2022-09-02",
    category: "Digital Lending",
    summary:
      "Establishes a comprehensive regulatory framework for digital lending, covering Lending Service Provider " +
      "(LSP) oversight, data collection restrictions, fair practices code, and technology security requirements " +
      "for digital lending apps and platforms. Addresses predatory lending, data privacy, and customer protection.",
    full_text:
      "RBI Guidelines on Digital Lending (2022). " +
      "Reference: RBI/2022-23/111; DOR.CRE.REC.66/21.07.001/2022-23. " +
      "Applicability: All RBI Regulated Entities (REs) engaged in digital lending directly or through " +
      "Lending Service Providers (LSPs). " +
      "Key Requirements: " +
      "(1) Lending Service Provider Oversight — REs must conduct due diligence of all LSPs; maintain list of " +
      "empanelled LSPs on website; LSPs cannot access borrower funds; all disbursements/repayments through RE accounts. " +
      "(2) Data Collection — Digital lending apps may collect only data necessary for credit assessment; " +
      "no access to phone contacts, media, or call logs without explicit consent; one-time consent required " +
      "at onboarding; data must not be shared with unauthorised third parties. " +
      "(3) Key Fact Statement (KFS) — Standardised disclosure of APR, fees, penalty, and grievance redress " +
      "before loan disbursement; KFS must be in simplified language. " +
      "(4) Cooling-off Period — Borrowers may exit within 3 days (retail) or 1 day (MSME) by repaying principal " +
      "without prepayment penalty. " +
      "(5) Technology Security — Digital lending platforms must comply with RBI cybersecurity framework; " +
      "data localisation requirements apply; penetration testing annually. " +
      "(6) Grievance Redress — Nodal officer for customer complaints; 30-day resolution timeline; " +
      "escalation to RBI Ombudsman permitted.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12382&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2023-OUT-001",
    title: "Master Direction on Outsourcing of IT Services",
    date: "2023-11-01",
    category: "Outsourcing",
    summary:
      "Updates the regulatory framework for outsourcing of IT and IT-enabled services by banks and NBFCs. " +
      "Introduces enhanced due diligence requirements, concentration risk management, and mandatory contractual " +
      "provisions covering data localisation, audit rights, incident notification, and sub-contracting restrictions.",
    full_text:
      "RBI Master Direction on Outsourcing of IT Services (2023). " +
      "Reference: RBI/2023-24/xx. " +
      "Applicability: All Scheduled Commercial Banks, NBFCs above INR 10,000 crore in assets, and Payment Banks. " +
      "Prohibited Outsourcing: Core management functions, internal audit (in spirit), compliance functions, " +
      "and any activity that would impair RBI's ability to supervise the RE. " +
      "Prior Intimation / Approval: REs must intimate RBI before outsourcing core banking system operations, " +
      "data centre operations for regulated data, critical payment infrastructure, and any offshore data processing. " +
      "Due Diligence Requirements: " +
      "(1) Tier 1 (Critical) — On-site security audit or CERT-In empanelled auditor report; annual review; " +
      "concentration risk assessment if vendor serves multiple REs. " +
      "(2) Tier 2 (Non-Critical) — Questionnaire-based assessment; biennial review. " +
      "Mandatory Contract Provisions: Data localisation in India; RBI and statutory auditor access rights; " +
      "incident notification within 6 hours; data return and deletion on termination; sub-contracting " +
      "restrictions (written bank approval required); SLA commitments aligned with RBI BCM requirements. " +
      "Concentration Risk: REs must assess systemic concentration where multiple regulated entities depend on " +
      "a single service provider for critical services. " +
      "Exit Strategy: Documented and tested exit plans for all Tier 1 vendors; tested at least annually.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12601&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2021-CLOUD-001",
    title: "Circular on Cloud Adoption by Regulated Entities",
    date: "2021-12-20",
    category: "IT Governance",
    summary:
      "Provides guidance on risk management for cloud computing adoption by RBI-regulated entities. " +
      "Covers data localisation obligations, vendor risk management, shared responsibility model, " +
      "and RBI supervisory access requirements for cloud-hosted systems.",
    full_text:
      "RBI Circular on Cloud Adoption by Regulated Entities (2021). " +
      "Reference: RBI/2021-22/xx. " +
      "Scope: All RBI-regulated entities adopting public, private, or hybrid cloud services for banking and " +
      "payment infrastructure. " +
      "Data Localisation: All data relating to Indian customers — financial transactions, KYC data, credit data — " +
      "must be stored and processed within India. Payment data must be stored exclusively in India per existing " +
      "Payment System Data Storage norms. Cross-border data transfer for non-sensitive operational data requires " +
      "explicit RBI approval. " +
      "Risk Management: REs must conduct cloud-specific risk assessments before adoption addressing: " +
      "vendor lock-in; data sovereignty; multi-tenancy risks; incident response; access controls; " +
      "encryption and key management. " +
      "RBI Supervisory Access: Cloud providers must grant RBI and statutory auditors unrestricted access to " +
      "all data, logs, and audit trails related to RE systems on request. Failure to ensure this access " +
      "disqualifies the provider from hosting critical RE systems. " +
      "Shared Responsibility: REs retain full regulatory responsibility for systems hosted in the cloud. " +
      "The shared responsibility matrix must be formally documented and reviewed annually. " +
      "Business Continuity: Multi-region deployment is recommended for critical systems; RPO/RTO must meet " +
      "RBI BCP requirements regardless of cloud model.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12180&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2016-CSF-001",
    title: "Cyber Security Framework in Banks",
    date: "2016-06-02",
    category: "Cybersecurity",
    summary:
      "Foundational circular establishing the Cyber Security Framework for Indian banks. Mandates baseline " +
      "cybersecurity controls, Cyber Crisis Management Plans, SOC setup, incident reporting to RBI, and " +
      "annual IS audits by CERT-In empanelled auditors. Basis for subsequent RBI cybersecurity directions.",
    full_text:
      "RBI Circular on Cyber Security Framework in Banks (2016). " +
      "Reference: RBI/2015-16/418; DBS.CO/CSITE/BC.11/33.01.001/2015-16. " +
      "Applicability: All Scheduled Commercial Banks (excluding RRBs). " +
      "Key Mandates: " +
      "(1) Cyber Security Policy — Board-approved policy to be put in place within 3 months of circular. " +
      "(2) Cyber Crisis Management Plan — CCMP covering detection, response, recovery, and containment. " +
      "Banks must test CCMP and share with RBI. " +
      "(3) SOC — Banks must set up Security Operations Centres or arrange for third-party SOC services " +
      "providing 24x7 monitoring. Deployment of SIEM covering all critical systems within 6 months. " +
      "(4) IS Audit — Annual IS Audit by CERT-In empanelled auditors; report to Board and RBI. " +
      "(5) Incident Reporting — Unusual cyber incidents to be reported to RBI within 2-6 hours; " +
      "detailed report within 14 days. Reporting format prescribed by RBI. " +
      "(6) Cyber Insurance — Banks encouraged to obtain cyber insurance; RBI to review making it mandatory. " +
      "(7) Customer Protection — Banks liable for customer losses from cyber fraud unless customer negligence " +
      "established; zero-liability protection framework to be implemented.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=10435&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2022-CERT-001",
    title: "Compliance with CERT-In Directions 2022 — Obligations for Banks",
    date: "2022-06-27",
    category: "Cybersecurity",
    summary:
      "RBI advisory to banks and payment system operators on compliance with the CERT-In Directions 2022 " +
      "requiring 6-hour incident reporting to CERT-In, 5-year log retention, ICT system synchronisation " +
      "with NIC servers, and prohibition on VPN usage that masks end-point identity.",
    full_text:
      "RBI Advisory on CERT-In Directions 2022 — Compliance Obligations for RBI Regulated Entities. " +
      "Reference: RBI/2022-23/xx. " +
      "Background: Ministry of Electronics and Information Technology (MeitY) issued CERT-In Directions 2022 " +
      "under Section 70B(6) of IT Act 2000, effective 28 June 2022. These are binding on all entities " +
      "including financial institutions. RBI regulated entities must comply with both CERT-In Directions " +
      "and RBI cybersecurity requirements. " +
      "Key CERT-In Obligations for REs: " +
      "(1) Incident Reporting — 67 types of incidents must be reported to CERT-In within 6 hours of detection, " +
      "including data breaches, ransomware, identity theft, DDoS, website defacement, and unauthorised access. " +
      "(2) Log Retention — ICT system logs must be maintained for 180 days within India; audit trails for 5 years. " +
      "(3) Clock Synchronisation — All ICT systems must synchronise with NIC or NPTEL NTP servers in India. " +
      "(4) KYC of Subscribers — Virtual Private Server, VPN, cloud, and data centre service providers must " +
      "maintain KYC records for 5 years. " +
      "RBI Position: Compliance with CERT-In Directions is non-negotiable. Banks must update incident response " +
      "procedures, log management, and vendor contracts to reflect CERT-In requirements. Where CERT-In timelines " +
      "are stricter than RBI requirements, CERT-In timelines govern.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12385&Mode=0",
    status: "active",
  },
  {
    reference: "RBI-CIR-2023-FRAUD-001",
    title: "Framework for Responsible and Ethical Enablement of Artificial Intelligence in Financial Services",
    date: "2023-07-15",
    category: "Technology Governance",
    summary:
      "RBI framework (FREE-AI) establishing principles and requirements for responsible AI adoption by " +
      "regulated entities in fraud detection, credit scoring, customer service, and compliance functions. " +
      "Covers model risk management, explainability, bias testing, and accountability.",
    full_text:
      "RBI Framework for Responsible and Ethical Enablement of AI (FREE-AI) in Financial Services (2023). " +
      "Reference: RBI/2023-24/xx. " +
      "Scope: All RBI regulated entities deploying AI/ML models for credit decisioning, fraud detection, " +
      "customer-facing applications, regulatory reporting, or risk management. " +
      "Key Principles: " +
      "(1) Transparency — AI models used in credit decisions must be explainable; customers must be informed " +
      "when AI is used in decisions affecting them; right to seek human review of adverse AI decisions. " +
      "(2) Fairness — Models must be tested for demographic bias before deployment; bias monitoring quarterly; " +
      "protected attributes (religion, gender, caste) must not be used as model inputs. " +
      "(3) Model Risk Management — AI models classified by risk tier; Tier 1 (high-risk, customer-facing) " +
      "require independent model validation before deployment; annual model validation for all tiers. " +
      "(4) Accountability — Board-approved AI governance policy; AI risk owner at senior management level; " +
      "model inventory maintained with version history. " +
      "(5) Data Quality — Training data must be representative of Indian demographics; data lineage documented; " +
      "model performance monitored monthly in production. " +
      "(6) Cyber Risks of AI — Adversarial attacks, model poisoning, and prompt injection risks must be " +
      "assessed for AI systems; AI systems not to bypass security controls.",
    pdf_url:
      "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12650&Mode=0",
    status: "active",
  },
];

const insertCircular = db.prepare(
  "INSERT OR IGNORE INTO circulars (reference, title, date, category, summary, full_text, pdf_url, status) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const c of circulars) {
  insertCircular.run(
    c.reference, c.title, c.date, c.category, c.summary, c.full_text, c.pdf_url, c.status,
  );
}
console.log(`Inserted ${circulars.length} circulars`);

// --- Summary ------------------------------------------------------------------

const fc = (db.prepare("SELECT COUNT(*) AS n FROM frameworks").get() as { n: number }).n;
const cc = (db.prepare("SELECT COUNT(*) AS n FROM controls").get() as { n: number }).n;
const circ = (db.prepare("SELECT COUNT(*) AS n FROM circulars").get() as { n: number }).n;

console.log(`
Database summary:
  Frameworks / Master Directions : ${fc}
  Direction Provisions           : ${cc}
  Circulars                      : ${circ}

Seed complete.`);
