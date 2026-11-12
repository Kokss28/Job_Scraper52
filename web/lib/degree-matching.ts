import { UnifiedJobRecord } from "./taxonomy";

export interface DegreeReportQuery {
  degree: string; // 'bsc' | 'msc' | 'bca' | 'mca' | 'btech' | 'all'
  timeframe?: string; // 'all'
  experience?: string; // 'fresher' | 'junior' | 'all'
  search?: string;
  skill?: string;
}

export interface SkillMetric {
  name: string;
  count: number;
  percentage: number;
  tier: "core" | "growth" | "differentiator";
}

export interface CategoryMetric {
  code: string; // "DA" | "DE" | "AI" | "SE" | "QA" | "Cloud" | "Other"
  category: string;
  count: number;
  percentage: number;
  color: string;
}

export interface CityMetric {
  city: string;
  count: number;
  percentage: number;
}

export interface CourseCurriculum {
  id: string;
  code: string; // DA | AI | SE | QA | DE
  title: string;
  badge: string;
  overview: string;
  matchScore: number;
  marketDemand: string;
  prerequisites: string;
  modules: Array<{
    moduleName: string;
    topics: string[];
  }>;
  capstoneProject: {
    title: string;
    description: string;
    tools: string[];
  };
}

export interface DegreeReportData {
  degree: string;
  degreeLabel: string;
  experienceFilter: string;
  totalMarketJobs: number;
  eligibleJobsCount: number;
  eligibilityRate: number;
  fresherJobsCount: number;
  fresherRate: number;
  avgMinExp: number;
  topCategories: CategoryMetric[];
  topSkills: SkillMetric[];
  categorySkills: Record<string, SkillMetric[]>;
  topCities: CityMetric[];
  courseCurriculums: CourseCurriculum[];
  sampleJobs: Array<{
    job_id: string;
    title: string;
    company: string;
    category_code: string;
    city: string;
    min_exp_years: number | null;
    max_exp_years: number | null;
    degree_required: string;
    skills: string[];
    link: string;
    collected_at: string;
    source: string;
  }>;
}

// Regex patterns to match degree eligibility
const DEGREE_PATTERNS: Record<string, { label: string; regex: RegExp }> = {
  bsc: {
    label: "B.Sc. (Bachelor of Science / CS / IT)",
    regex: /\b(b\.?sc|bachelor\s+of\s+science|any\s+graduate|any\s+bachelor|bca)\b/i,
  },
  msc: {
    label: "M.Sc. (Master of Science / CS / IT)",
    regex: /\b(m\.?sc|master\s+of\s+science|any\s+postgraduate|any\s+master|mca)\b/i,
  },
  bca: {
    label: "BCA (Bachelor of Computer Applications)",
    regex: /\b(bca|b\.?c\.?a|any\s+graduate|any\s+bachelor|b\.?sc)\b/i,
  },
  mca: {
    label: "MCA (Master of Computer Applications)",
    regex: /\b(mca|m\.?c\.?a|any\s+postgraduate|any\s+master|m\.?tech)\b/i,
  },
  btech: {
    label: "B.E. / B.Tech (Engineering)",
    regex: /\b(b\.?tech|b\.?e\b|engineering|any\s+graduate)\b/i,
  },
  all: {
    label: "All Degrees (Any Graduate / Open Eligibility)",
    regex: /.*/i,
  },
};

// Pure Technical Hard Skills (Excluding Soft Skills like Communication/Teamwork)
const KNOWN_SKILLS = [
  "Python", "SQL", "Power BI", "Tableau", "Excel", "Java", "AWS", "Azure",
  "Git", "Docker", "Linux", "R", "Pandas", "NumPy", "Scikit-Learn",
  "JavaScript", "TypeScript", "React", "Node.js", "FastAPI", "C++", "C#", ".NET",
  "PostgreSQL", "MySQL", "MongoDB", "ETL", "Data Warehousing", "Machine Learning",
  "Testing", "Selenium", "API", "REST", "Kubernetes", "Spark", "DevOps"
];

// High-precision Title-First Job Category Classifier
export function classifyJobCategory(title: string, skills?: string, desc?: string): string {
  const t = String(title || "").toLowerCase();

  // 1. High-confidence classification based on Job Title
  if (/\b(qa\b|tester|test\s+engineer|sdet|quality\s+assurance|automation\s+tester)/i.test(t)) {
    return "QA";
  }
  if (/\b(cloud|devops|sre\b|site\s+reliability|infrastructure|sysadmin)/i.test(t)) {
    return "Cloud";
  }
  if (/\b(data\s+engineer|etl\s+developer|pipeline\s+engineer|big\s+data|spark\s+developer)/i.test(t)) {
    return "DE";
  }
  if (/\b(data\s+scientist|ai\s+engineer|machine\s+learning|\bml\b|artificial\s+intelligence|genai|deep\s+learning|nlp|computer\s+vision|llm)/i.test(t)) {
    return "AI";
  }
  if (/\b(data\s+analyst|business\s+analyst|bi\s+developer|power\s+bi|tableau|reporting\s+analyst|statistician|\bbi\s+analyst|\bbi\s+developer|mis\s+executive)/i.test(t)) {
    return "DA";
  }
  if (/\b(software|developer|frontend|backend|fullstack|full\s+stack|programmer|web\s+developer|react|java\s+dev|python\s+dev|node|angular|api\s+developer)/i.test(t)) {
    return "SE";
  }

  // 2. If title is generic (e.g. 'Trainee', 'Associate', 'Consultant'), inspect skills and description
  const combined = `${skills || ""} ${desc || ""}`.toLowerCase();
  if (/\b(qa\b|tester|test\s+engineer|sdet|quality\s+assurance)/i.test(combined)) {
    return "QA";
  }
  if (/\b(data\s+analyst|business\s+analyst|power\s+bi|tableau|bi\s+developer)/i.test(combined)) {
    return "DA";
  }
  if (/\b(data\s+scientist|ai\s+engineer|machine\s+learning|\bml\b|genai|deep\s+learning)/i.test(combined)) {
    return "AI";
  }
  if (/\b(data\s+engineer|etl|pipeline|big\s+data)/i.test(combined)) {
    return "DE";
  }
  if (/\b(cloud|devops|aws|azure|docker|kubernetes)/i.test(combined)) {
    return "Cloud";
  }
  if (/\b(software|developer|frontend|backend|fullstack|react|node|java\b)/i.test(combined)) {
    return "SE";
  }

  return "Other";
}

// Targeted Standard Industry Job Categories (DA, DE, AI, SE, QA, Cloud)
const CATEGORY_RULES: Array<{ code: string; name: string; regex: RegExp; color: string }> = [
  {
    code: "DA",
    name: "Data Analytics & BI",
    regex: /data\s+analyst|business\s+analyst|bi\s+developer|analytics|power\s+bi|tableau|reporting\s+analyst|statistician|\bbi\b/i,
    color: "#6366f1", // indigo
  },
  {
    code: "AI",
    name: "AI & Machine Learning",
    regex: /data\s+scientist|ai\s+engineer|machine\s+learning|\bml\b|artificial\s+intelligence|genai|deep\s+learning|nlp\b|computer\s+vision|llm\b/i,
    color: "#ec4899", // pink/magenta
  },
  {
    code: "SE",
    name: "Software Engineering & Dev",
    regex: /software|developer|frontend|backend|fullstack|python|java|react|node|api\s+developer|web\s+developer|programmer/i,
    color: "#3b82f6", // blue
  },
  {
    code: "Cloud",
    name: "Cloud & DevOps Engineering",
    regex: /cloud|devops|aws|azure|gcp|linux|sysadmin|infrastructure|sre\b|site\s+reliability/i,
    color: "#f59e0b", // amber
  },
  {
    code: "DE",
    name: "Data Engineering & Pipelines",
    regex: /data\s+engineer|etl|pipeline|data\s+warehouse|spark|dbt|hadoop|big\s+data/i,
    color: "#06b6d4", // cyan
  },
  {
    code: "QA",
    name: "QA & Test Automation",
    regex: /qa\b|tester|test\s+engineer|sdet|quality\s+assurance|software\s+test|automation\s+test/i,
    color: "#10b981", // emerald
  },
];

export const TARGET_CURRICULUMS: CourseCurriculum[] = [
  {
    id: "da",
    code: "DA",
    title: "Data Analytics & Business Intelligence",
    badge: "Highest Graduate Volume (50%+)",
    overview:
      "The #1 entry point for B.Sc., BCA & science graduates into high-paying corporate tech roles. Teaches turning raw enterprise data into actionable executive insights with SQL, Python & Power BI.",
    matchScore: 96,
    marketDemand: "Very High • Highest Vacancies Across India",
    prerequisites: "Basic Mathematics, Logical Thinking, High School Statistics",
    modules: [
      {
        moduleName: "Module 1: Advanced SQL for Data Extraction",
        topics: [
          "Multi-table Relational Joins (INNER, LEFT, FULL OUTER, CROSS)",
          "Aggregations & Grouping (GROUP BY, HAVING, ROLLUP, CUBE)",
          "Advanced Window Functions (ROW_NUMBER, DENSE_RANK, LEAD, LAG, NTILE)",
          "Common Table Expressions (CTEs) & Subqueries for complex filtering",
          "Database Indexing, Performance Tuning & Query Execution Plans",
        ],
      },
      {
        moduleName: "Module 2: Python for Data Science & Wrangling",
        topics: [
          "Pandas DataFrames: Filtering, Merging, Melting & Pivot Tables",
          "Data Cleansing: Handling Missing Values, Outliers & Type Conversions",
          "NumPy: Fast Vectorized Operations & Numerical Calculations",
          "Exploratory Data Analysis (EDA) with Seaborn & Matplotlib",
          "Automated ETL Pipelines with Python Scripts & CSV/SQL Connections",
        ],
      },
      {
        moduleName: "Module 3: Business Intelligence Dashboards (Power BI / Tableau)",
        topics: [
          "Star Schema & Snowflake Data Modeling, Relationship Cardinality",
          "DAX Measures: CALCULATE, ALL, RELATED, Time Intelligence Functions (YTD, QTD)",
          "Interactive Visualizations: Drill-through filters, Custom Tooltips, Slicers",
          "Power Query M-Language Transformations & Automated Data Refreshes",
          "Designing Executive C-Suite Dashboards with Actionable KPIs",
        ],
      },
      {
        moduleName: "Module 4: Business Statistics & Advanced Excel",
        topics: [
          "Descriptive Statistics: Mean, Median, Standard Deviation, Skewness",
          "Inferential Statistics: A/B Testing, Hypothesis Testing, p-values, Z-Scores",
          "Advanced Excel: XLOOKUP, INDEX/MATCH, Dynamic Arrays, Nested IFs",
        ],
      },
    ],
    capstoneProject: {
      title: "End-to-End E-Commerce Customer Churn & Retention Analytics",
      description:
        "Extract 100K customer records with SQL, clean data in Python Pandas, uncover churn patterns, and build an interactive Power BI Executive Dashboard with automated DAX metrics.",
      tools: ["PostgreSQL", "Python Pandas", "Power BI", "Excel", "Git"],
    },
  },
  {
    id: "ai_ml",
    code: "AI",
    title: "Artificial Intelligence & Generative AI",
    badge: "Highest Salary Growth & Future Demand",
    overview:
      "A fast-growing specialization for ambitious graduates. Covers foundational machine learning algorithms through modern Generative AI, LLMs, Transformers, and RAG architectures.",
    matchScore: 94,
    marketDemand: "High Growth • Expanding Rapidly across Global GCCs & Startups",
    prerequisites: "Python Basics, Linear Algebra, Probability",
    modules: [
      {
        moduleName: "Module 1: Applied Mathematics & Core Machine Learning",
        topics: [
          "Linear Algebra for AI: Vectors, Matrices, Eigenvalues & Dot Products",
          "Supervised Algorithms: Linear & Logistic Regression, Decision Trees",
          "Ensemble Methods: Random Forest, XGBoost, LightGBM, Gradient Boosting",
          "Unsupervised Learning: K-Means Clustering, PCA Dimensionality Reduction",
          "Model Evaluation Metrics: Confusion Matrix, Precision, Recall, F1, ROC-AUC",
        ],
      },
      {
        moduleName: "Module 2: Deep Learning & Neural Network Foundations",
        topics: [
          "Artificial Neural Networks (ANN) architecture & Backpropagation",
          "Activation Functions (ReLU, Softmax, Sigmoid) & Loss Functions",
          "Overfitting Prevention: Dropout, Batch Normalization, Early Stopping",
          "PyTorch & TensorFlow model training, validation & testing pipelines",
        ],
      },
      {
        moduleName: "Module 3: Generative AI, LLMs & Prompt Engineering",
        topics: [
          "Transformer Architecture (Attention Mechanism) & Tokenization",
          "Hugging Face: Pre-trained Models, Pipelines, and Fine-Tuning basics",
          "Prompt Engineering: Few-shot, Chain-of-Thought, System Prompts",
          "Retrieval-Augmented Generation (RAG): Vector Databases (Chroma/FAISS)",
          "Building LLM Agents using LangChain & LlamaIndex",
        ],
      },
      {
        moduleName: "Module 4: AI Model Deployment & API Serving",
        topics: [
          "FastAPI & Flask REST endpoints for live model inference",
          "Containerizing AI pipelines using Docker for reproducible environments",
          "Deploying interactive AI prototypes with Streamlit & Gradio",
        ],
      },
    ],
    capstoneProject: {
      title: "Enterprise Document QA & Resume Screening RAG AI System",
      description:
        "Build an AI application that ingests PDF documents, stores embeddings in a Vector DB, and uses an open-source LLM via LangChain to answer queries with precise citations.",
      tools: ["Python", "PyTorch", "LangChain", "ChromaDB", "FastAPI", "Streamlit"],
    },
  },
  {
    id: "se",
    code: "SE",
    title: "Software Engineering & Full Stack Dev",
    badge: "Core Product Engineering Track",
    overview:
      "For graduates wanting to build scalable web applications, REST microservice APIs, database architecture, and production frontend user interfaces.",
    matchScore: 92,
    marketDemand: "High • Massive Hiring Volume in Every IT Hub",
    prerequisites: "Basic Programming, Problem Solving, Data Structures",
    modules: [
      {
        moduleName: "Module 1: Object-Oriented Programming (OOP) & Data Structures",
        topics: [
          "Classes, Inheritance, Polymorphism, Encapsulation & Design Patterns",
          "Data Structures: Lists, Dictionaries, Sets, Tuples, Queues, Stacks",
          "Algorithm Complexity: Big-O Notation, Searching & Sorting algorithms",
          "Exception Handling, Context Managers, Generators & Decorators",
        ],
      },
      {
        moduleName: "Module 2: Modern Web Frameworks & REST APIs",
        topics: [
          "FastAPI & Django REST Framework: Routing, Path/Query Parameters",
          "Request/Response Validation with Pydantic schemas",
          "User Authentication & Authorization: JWT Tokens, Password Hashing",
          "CRUD Operations, Middleware, CORS & Error Handling",
        ],
      },
      {
        moduleName: "Module 3: Frontend Foundations (React & Modern UI)",
        topics: [
          "React Component Lifecycle, Hooks (useState, useEffect, useMemo)",
          "Tailwind CSS for responsive, modern UI styling",
          "State Management and API consumption with fetch/Axios",
        ],
      },
      {
        moduleName: "Module 4: DevOps, Testing & Production Deployment",
        topics: [
          "Automated Testing with PyTest: Unit tests, Fixtures, Mocking",
          "Docker Containerization & Docker Compose for multi-service apps",
          "Git branch workflows, GitHub Actions CI/CD automation",
          "Cloud deployment on AWS EC2 or Render / Railway",
        ],
      },
    ],
    capstoneProject: {
      title: "Full-Stack Job Tracker & Application Pipeline Platform",
      description:
        "Design a full-featured web platform with React frontend, FastAPI backend, JWT authentication, PostgreSQL relational database, Redis caching, and Docker deployment.",
      tools: ["FastAPI", "React", "PostgreSQL", "SQLAlchemy", "Docker", "PyTest"],
    },
  },
  {
    id: "cloud",
    code: "Cloud",
    title: "Cloud Computing & DevOps Engineering",
    badge: "Mission-Critical Cloud Infrastructure",
    overview:
      "Focuses on Linux system administration, AWS/Azure cloud architecture, containerization with Docker, Kubernetes orchestration, and automated CI/CD pipelines.",
    matchScore: 90,
    marketDemand: "High • Essential for Global Enterprises & Cloud Scale-ups",
    prerequisites: "Command Line Basics, Computer Networking Foundations",
    modules: [
      {
        moduleName: "Module 1: Linux Administration & Shell Scripting",
        topics: [
          "Linux Filesystem & Permissions (chmod, chown, umask)",
          "Process Management (systemctl, ps, top, htop, kill)",
          "Bash Scripting & Cron Automation for repetitive system tasks",
          "Networking Fundamentals (DNS, TCP/IP, SSH keys, Firewalls, iptables)",
          "Package Management (apt, yum) & System Troubleshooting",
        ],
      },
      {
        moduleName: "Module 2: Cloud Computing Architecture (AWS / Azure)",
        topics: [
          "Compute: AWS EC2 & Azure Virtual Machines setup & management",
          "Object Storage: AWS S3 & Azure Blob with lifecycle policies",
          "Identity & Access Management (IAM) Roles, Policies & Multi-Factor Auth",
          "Virtual Private Cloud (VPC), Subnets, Security Groups & NAT Gateways",
          "Serverless Architecture: AWS Lambda & API Gateway triggers",
        ],
      },
      {
        moduleName: "Module 3: Containerization & Microservices with Docker",
        topics: [
          "Docker Architecture: Images, Containers, Registries (Docker Hub, ECR)",
          "Writing Production Multi-stage Dockerfiles for minimal image size",
          "Docker Compose for Multi-container Orchestration",
          "Container Networking, Persistent Volumes & Environment Secrets",
        ],
      },
      {
        moduleName: "Module 4: CI/CD Pipelines & Kubernetes Orchestration",
        topics: [
          "Automated CI/CD with GitHub Actions: Workflows, Triggers & Runners",
          "Kubernetes Core Architecture: Pods, Services, Deployments & ConfigMaps",
          "Horizontal Pod Autoscaling (HPA) & Ingress Controllers",
          "Infrastructure as Code (IaC) with Terraform basics",
          "Production Monitoring: Prometheus, Grafana & CloudWatch",
        ],
      },
    ],
    capstoneProject: {
      title: "Automated Production Microservices CI/CD Pipeline on AWS",
      description:
        "Design and implement an automated CI/CD pipeline using GitHub Actions that builds Docker containers, runs automated PyTest suites, pushes images to AWS ECR, and deploys to an AWS EC2 instance with automated SSL and Nginx reverse proxy.",
      tools: ["AWS", "Docker", "GitHub Actions", "Linux", "Nginx", "Kubernetes"],
    },
  },
  {
    id: "de",
    code: "DE",
    title: "Data Engineering & Big Data Pipelines",
    badge: "High-Throughput Big Data Track",
    overview:
      "Focuses on designing high-throughput data pipelines, data warehouses, batch/streaming ingestion, and distributed database architecture.",
    matchScore: 89,
    marketDemand: "High • Crucial for Scale-ups & Tech Hubs",
    prerequisites: "SQL Fundamentals, Basic Python or Java",
    modules: [
      {
        moduleName: "Module 1: Advanced Database Architecture & Modeling",
        topics: [
          "OLTP vs OLAP Architecture, Star Schema & Snowflake Schema",
          "PostgreSQL Deep Dive: Partitioning, Sharding, VACUUM, Query Optimization",
          "Data Warehousing: Google BigQuery, Snowflake & Amazon Redshift basics",
        ],
      },
      {
        moduleName: "Module 2: Data Ingestion & Pipeline Orchestration",
        topics: [
          "Building Robust ETL Pipelines in Python (Extract, Transform, Load)",
          "Apache Airflow & Prefect for scheduled workflow orchestration",
          "Handling API Ingestion, Rate Limits, Backoffs & Schema Validation",
        ],
      },
      {
        moduleName: "Module 3: Distributed Big Data Processing",
        topics: [
          "Apache Spark Core & PySpark: RDDs, DataFrames, Transformations & Actions",
          "Streaming Data Basics: Apache Kafka topics, producers & consumers",
        ],
      },
    ],
    capstoneProject: {
      title: "Automated Multi-Source Job Market ETL Pipeline with PySpark & PostgreSQL",
      description:
        "Build an automated data pipeline that extracts live job postings, cleans and enriches data with PySpark, loads into a PostgreSQL data warehouse, and runs automated data quality audits.",
      tools: ["Python", "PySpark", "PostgreSQL", "Docker", "Apache Airflow"],
    },
  },
  {
    id: "qa",
    code: "QA",
    title: "Quality Assurance & Test Automation (SDET)",
    badge: "High Placement & Stability Track",
    overview:
      "A proven, low-barrier pathway for non-engineering science graduates into major IT companies with high stability and career longevity.",
    matchScore: 86,
    marketDemand: "Moderate • High Placement Ratio in Major IT Services Companies",
    prerequisites: "Attention to Detail, Basic Logic, Problem Solving",
    modules: [
      {
        moduleName: "Module 1: Software Testing Principles & Methodologies",
        topics: [
          "Software Development Life Cycle (SDLC) & STLC in Agile/Scrum",
          "Test Case Design Techniques: Boundary Value Analysis, Equivalence Partitioning",
          "Defect Management & Bug Tracking in Jira / Bugzilla",
          "Regression, Smoke, Sanity & User Acceptance Testing (UAT)",
        ],
      },
      {
        moduleName: "Module 2: Web Test Automation with Selenium & Playwright",
        topics: [
          "Locator Strategies: Dynamic XPath, CSS Selectors, Text selectors",
          "Page Object Model (POM) Design Pattern for maintainable test suites",
          "Handling Dynamic Waits, Alerts, Frames, Multi-window tabs",
          "Cross-browser execution: Chrome, Firefox, WebKit in Headless mode",
        ],
      },
      {
        moduleName: "Module 3: API Testing & Continuous Integration",
        topics: [
          "Postman: Collections, Environment Variables, Automated Pre-request Scripts",
          "REST Assured / Python Requests for programmatic API testing",
          "Integrating test suites into GitHub Actions CI pipelines with HTML reports",
        ],
      },
    ],
    capstoneProject: {
      title: "Automated E-Commerce End-to-End Regression Test Suite",
      description:
        "Create an automated testing framework using Playwright/Selenium and PyTest, incorporating Page Object Model, data-driven tests, and automated GitHub Actions reporting.",
      tools: ["Playwright", "Selenium", "Python PyTest", "Postman", "Git"],
    },
  },
];

export function generateDegreeCareerReport(
  jobs: UnifiedJobRecord[],
  query: DegreeReportQuery
): DegreeReportData {
  const degreeKey = (query.degree || "bsc").toLowerCase();
  const degreeConfig = DEGREE_PATTERNS[degreeKey] || DEGREE_PATTERNS.bsc;
  const experienceFilter = query.experience || "fresher";
  const timeframe = (query.timeframe || "all").toLowerCase();

  // 0. Timeframe / Month filter
  let timeFiltered = jobs;
  if (timeframe && timeframe !== "all") {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    if (/^\d{4}-\d{2}$/.test(timeframe)) {
      const [yearStr, monthStr] = timeframe.split("-");
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      timeFiltered = jobs.filter((j) => {
        if (!j.collected_at) return false;
        const d = new Date(j.collected_at);
        return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m - 1;
      });
    } else if (timeframe === "this_month") {
      timeFiltered = jobs.filter((j) => {
        if (!j.collected_at) return false;
        const d = new Date(j.collected_at);
        return !isNaN(d.getTime()) && d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
    } else if (timeframe === "last_month") {
      const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
      const prevYear = curMonth === 0 ? curYear - 1 : curYear;
      timeFiltered = jobs.filter((j) => {
        if (!j.collected_at) return false;
        const d = new Date(j.collected_at);
        return !isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
      });
    } else if (timeframe === "30d") {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      timeFiltered = jobs.filter((j) => {
        if (!j.collected_at) return false;
        const d = new Date(j.collected_at);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
    } else if (timeframe === "7d") {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      timeFiltered = jobs.filter((j) => {
        if (!j.collected_at) return false;
        const d = new Date(j.collected_at);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
    }
  }

  // Fallback to original jobs if timeframe produced 0 records
  if (timeFiltered.length === 0 && jobs.length > 0) {
    timeFiltered = jobs;
  }

  const totalMarketJobs = timeFiltered.length;

  // 1. Filter jobs by degree pattern
  let filtered = timeFiltered.filter((job) => {
    if (degreeKey === "all") return true;
    const deg = String(job.degree_required || "");
    const desc = String(job.full_description || "");
    return degreeConfig.regex.test(deg) || degreeConfig.regex.test(desc);
  });

  if (filtered.length < 15 && jobs.length > 0 && degreeKey !== "all") {
    filtered = jobs.filter((job) => {
      const deg = String(job.degree_required || "").toLowerCase();
      return (
        deg.includes("any") ||
        deg.includes("graduate") ||
        deg.includes("bachelor") ||
        deg.includes("not specified") ||
        deg === ""
      );
    });
  }

  // 2. Filter by experience (strictly require explicitly specified experience to avoid inflating fresher counts)
  if (experienceFilter === "fresher") {
    filtered = filtered.filter((j) => j.min_exp_num !== null && j.min_exp_num <= 1);
  } else if (experienceFilter === "junior") {
    filtered = filtered.filter((j) => j.min_exp_num !== null && j.min_exp_num <= 3);
  }

  // 3. Search query filter
  if (query.search && query.search.trim().length > 0) {
    const q = query.search.toLowerCase();
    filtered = filtered.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.skills.toLowerCase().includes(q)
    );
  }

  // 4. Click-to-filter specific skill
  if (query.skill && query.skill.trim().length > 0) {
    const s = query.skill.toLowerCase();
    const regex = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    filtered = filtered.filter((j) => {
      const combined = `${j.skills || ""} ${j.full_description || ""}`.toLowerCase();
      return regex.test(combined);
    });
  }

  const eligibleJobsCount = filtered.length;
  const eligibilityRate = totalMarketJobs > 0 ? Math.round((eligibleJobsCount / totalMarketJobs) * 100) : 0;

  const fresherJobsCount = filtered.filter((j) => j.min_exp_num !== null && j.min_exp_num <= 1).length;
  const fresherRate = eligibleJobsCount > 0 ? Math.round((fresherJobsCount / eligibleJobsCount) * 100) : 0;

  const knownExpJobs = filtered.filter((j) => j.min_exp_num !== null);
  const expSum = knownExpJobs.reduce((acc, j) => acc + (j.min_exp_num as number), 0);
  const avgMinExp = knownExpJobs.length > 0 ? Math.round((expSum / knownExpJobs.length) * 10) / 10 : 0;

  // 5. Compute Top Categories (DA, DE, AI, SE, QA, Cloud) using Title-First Classification
  const catCodeCounts: Record<string, number> = {
    DA: 0,
    AI: 0,
    SE: 0,
    Cloud: 0,
    DE: 0,
    QA: 0,
  };
  let otherCount = 0;

  filtered.forEach((j) => {
    const code = classifyJobCategory(j.title, j.skills, j.full_description);
    if (code in catCodeCounts) {
      catCodeCounts[code]++;
    } else {
      otherCount++;
    }
  });

  const topCategories: CategoryMetric[] = CATEGORY_RULES.map((rule) => {
    const count = catCodeCounts[rule.code] || 0;
    return {
      code: rule.code,
      category: rule.name,
      count,
      percentage: eligibleJobsCount > 0 ? Math.round((count / eligibleJobsCount) * 100) : 0,
      color: rule.color,
    };
  }).filter((c) => c.count > 0);

  if (otherCount > 0) {
    topCategories.push({
      code: "Other",
      category: "Other Technical Domains",
      count: otherCount,
      percentage: eligibleJobsCount > 0 ? Math.round((otherCount / eligibleJobsCount) * 100) : 0,
      color: "#94a3b8",
    });
  }

  // Sort categories by highest count first
  topCategories.sort((a, b) => b.count - a.count);

  // 6. Compute Skills Ranking
  const skillCounts: Record<string, number> = {};
  KNOWN_SKILLS.forEach((s) => (skillCounts[s] = 0));

  filtered.forEach((j) => {
    const rawSkills = String(j.skills || "").toLowerCase();
    const desc = String(j.full_description || "").toLowerCase();
    const combined = `${rawSkills} ${desc}`;

    KNOWN_SKILLS.forEach((skill) => {
      const sLower = skill.toLowerCase();
      const regex = new RegExp(`\\b${sLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(combined)) {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      }
    });
  });

  const topSkills: SkillMetric[] = Object.entries(skillCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count], index) => {
      const percentage = eligibleJobsCount > 0 ? Math.round((count / eligibleJobsCount) * 100) : 0;
      let tier: "core" | "growth" | "differentiator" = "growth";
      if (index < 3 || percentage >= 45) tier = "core";
      else if (index >= 7) tier = "differentiator";

      return {
        name,
        count,
        percentage,
        tier,
      };
    });

  // 6b. Compute Category-Specific Skills Ranking (DA, AI, SE, Cloud, DE, QA)
  const categorySkills: Record<string, SkillMetric[]> = {};
  CATEGORY_RULES.forEach((rule) => {
    const catJobs = filtered.filter((j) => {
      return classifyJobCategory(j.title, j.skills, j.full_description) === rule.code;
    });

    const catSkillCounts: Record<string, number> = {};
    KNOWN_SKILLS.forEach((s) => (catSkillCounts[s] = 0));

    catJobs.forEach((j) => {
      const combined = `${j.skills || ""} ${j.full_description || ""}`.toLowerCase();
      KNOWN_SKILLS.forEach((skill) => {
        const sLower = skill.toLowerCase();
        const regex = new RegExp(`\\b${sLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (regex.test(combined)) {
          catSkillCounts[skill] = (catSkillCounts[skill] || 0) + 1;
        }
      });
    });

    const totalCatJobs = catJobs.length;
    categorySkills[rule.code] = Object.entries(catSkillCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count], index) => {
        const percentage = totalCatJobs > 0 ? Math.round((count / totalCatJobs) * 100) : 0;
        let tier: "core" | "growth" | "differentiator" = "growth";
        if (index < 2 || percentage >= 45) tier = "core";
        else if (index >= 5) tier = "differentiator";
        return { name, count, percentage, tier };
      });
  });

  // 7. Compute Top Cities
  const cityCounts: Record<string, number> = {};
  filtered.forEach((j) => {
    let city = (j.normalized_location || j.city || "Pan India").trim();
    if (city.toUpperCase() === "CT" || city.toUpperCase() === "CT, INDIA") {
      city = "Pan-India (Flexible)";
    }
    if (city && city !== "Not Specified") {
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
  });

  const topCities: CityMetric[] = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({
      city,
      count,
      percentage: eligibleJobsCount > 0 ? Math.round((count / eligibleJobsCount) * 100) : 0,
    }));

  // 8. Extract Sample Jobs (return ALL filtered jobs tagged for 100% accurate category & skill filtering)
  const sampleJobs = filtered.map((j) => {
    let skillList: string[] = [];
    if (j.skills && j.skills !== "Not Specified") {
      skillList = j.skills
        .split(/[,|;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5);
    }
    if (skillList.length === 0) {
      skillList = ["Technical Aptitude", "Problem Solving"];
    }

    // Determine category_code using Title-First Classifier
    const jobCatCode = classifyJobCategory(j.title, j.skills, j.full_description);

    return {
      job_id: j.job_id,
      title: j.title,
      company: j.company,
      category_code: jobCatCode,
      city: (() => {
        const c = String(j.normalized_location || j.city || "India").trim();
        return (c.toUpperCase() === "CT" || c.toUpperCase() === "CT, INDIA") ? "Pan-India (Flexible)" : c;
      })(),
      min_exp_years: j.min_exp_num !== null ? j.min_exp_num : null,
      max_exp_years: j.max_exp_num !== null ? j.max_exp_num : null,
      degree_required: j.degree_required || "Any Graduate",
      skills: skillList,
      link: j.link || "#",
      collected_at: j.collected_at || new Date().toISOString(),
      source: j.source || "Naukri",
    };
  });

  return {
    degree: degreeKey,
    degreeLabel: degreeConfig.label,
    experienceFilter,
    totalMarketJobs,
    eligibleJobsCount,
    eligibilityRate,
    fresherJobsCount,
    fresherRate,
    avgMinExp,
    topCategories,
    topSkills,
    categorySkills,
    topCities,
    courseCurriculums: TARGET_CURRICULUMS,
    sampleJobs,
  };
}
