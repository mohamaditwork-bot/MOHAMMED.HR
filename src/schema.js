// Database schema and the editable columns of every table.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kv (
  key text PRIMARY KEY,
  value text NOT NULL,
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS employees (
  id serial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'staff',
  status text NOT NULL DEFAULT 'active',
  emp_no text,
  name_ar text NOT NULL,
  name_en text,
  id_no text UNIQUE,
  nationality text,
  gender text,
  birth_date date,
  mobile text,
  email text,
  national_address text,
  sector text,
  department text,
  job_title text,
  iqama_job text,
  qiwa_job text,
  join_date date,
  start_date date,
  grade text,
  leave_days numeric,
  basic_salary numeric,
  housing text,
  transport text,
  total_salary numeric,
  bank text,
  iban text,
  qualification text,
  specialty text,
  experience text,
  gosi text,
  company text,
  work_hours numeric,
  platform jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  number text,
  issue_date date,
  expiry_date date,
  details jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, doc_type)
);

CREATE TABLE IF NOT EXISTS dependents (
  id serial PRIMARY KEY,
  employee_id integer REFERENCES employees(id) ON DELETE CASCADE,
  name text NOT NULL,
  iqama_no text UNIQUE,
  relation text,
  passport_expiry date,
  notes text
);

CREATE TABLE IF NOT EXISTS insurance (
  id serial PRIMARY KEY,
  employee_id integer REFERENCES employees(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  id_no text UNIQUE,
  relation text,
  class text,
  gender text,
  nationality text,
  birth_date date,
  mobile text,
  member_no text,
  notes text
);

CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  person text,
  id_no text,
  details text,
  status text NOT NULL DEFAULT 'open',
  due_date date,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id serial PRIMARY KEY,
  title text NOT NULL,
  department text,
  openings integer DEFAULT 1,
  saudi_only boolean DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  salary_range text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applicants (
  id serial PRIMARY KEY,
  job_id integer REFERENCES jobs(id) ON DELETE SET NULL,
  name text NOT NULL,
  nationality text,
  id_no text,
  mobile text,
  email text,
  stage text NOT NULL DEFAULT 'new',
  rating integer,
  source text,
  expected_salary numeric,
  cv_text text,
  notes text,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saud_rules (
  id serial PRIMARY KEY,
  name text NOT NULL,
  occupations text,
  required_pct numeric,
  source text,
  effective_date date,
  notes text
);

CREATE TABLE IF NOT EXISTS audit (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id text,
  user_name text,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb
);
`;

// Editable columns per table (anything else in a request is ignored).
// type: text | date | number | int | bool | json
export const TABLES = {
  employees: {
    cols: {
      kind: "text", status: "text", emp_no: "text", name_ar: "text", name_en: "text", id_no: "text",
      nationality: "text", gender: "text", birth_date: "date", mobile: "text", email: "text",
      national_address: "text", sector: "text", department: "text", job_title: "text", iqama_job: "text",
      qiwa_job: "text", join_date: "date", start_date: "date", grade: "text", leave_days: "number",
      basic_salary: "number", housing: "text", transport: "text", total_salary: "number", bank: "text",
      iban: "text", qualification: "text", specialty: "text", experience: "text", gosi: "text",
      company: "text", work_hours: "number", platform: "json", notes: "text",
    },
    required: ["name_ar"],
    touch: true,
    order: "kind, department NULLS LAST, name_ar",
  },
  documents: {
    cols: {
      employee_id: "int", doc_type: "text", number: "text", issue_date: "date", expiry_date: "date",
      details: "json", notes: "text",
    },
    required: ["employee_id", "doc_type"],
    touch: true,
    order: "expiry_date NULLS LAST",
  },
  dependents: {
    cols: { employee_id: "int", name: "text", iqama_no: "text", relation: "text", passport_expiry: "date", notes: "text" },
    required: ["name"],
    order: "name",
  },
  insurance: {
    cols: {
      employee_id: "int", member_name: "text", id_no: "text", relation: "text", class: "text", gender: "text",
      nationality: "text", birth_date: "date", mobile: "text", member_no: "text", notes: "text",
    },
    required: ["member_name"],
    order: "employee_id NULLS LAST, relation, member_name",
  },
  tasks: {
    cols: {
      category: "text", title: "text", person: "text", id_no: "text", details: "text", status: "text",
      due_date: "date", source: "text",
    },
    required: ["title"],
    order: "status DESC, due_date NULLS LAST, id",
  },
  jobs: {
    cols: {
      title: "text", department: "text", openings: "int", saudi_only: "bool", status: "text",
      salary_range: "text", description: "text",
    },
    required: ["title"],
    order: "status, created_at DESC",
  },
  applicants: {
    cols: {
      job_id: "int", name: "text", nationality: "text", id_no: "text", mobile: "text", email: "text",
      stage: "text", rating: "int", source: "text", expected_salary: "number", cv_text: "text", notes: "text",
      ai_summary: "text",
    },
    required: ["name"],
    order: "created_at DESC",
  },
  saud_rules: {
    cols: { name: "text", occupations: "text", required_pct: "number", source: "text", effective_date: "date", notes: "text" },
    required: ["name"],
    order: "name",
  },
};

// Convert an incoming value to what Postgres expects for the column type.
export function coerce(type, v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  switch (type) {
    case "int": {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
    case "number": {
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return v === true || v === "true" || v === 1 || v === "1";
    case "date": {
      const s = String(v).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }
    case "json":
      return typeof v === "string" ? v : JSON.stringify(v);
    default:
      return String(v).trim().slice(0, 5000);
  }
}
