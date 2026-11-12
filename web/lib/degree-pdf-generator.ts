import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DegreeReportData } from "./degree-matching";

export function generateDirectDegreePdf(data: DegreeReportData, selectedCategory?: string | null) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = 16;

  // Primary Colors (RGB Tuple)
  const primaryIndigo: [number, number, number] = [79, 70, 229]; // #4F46E5
  const darkSlate: [number, number, number] = [15, 23, 42]; // #0F172A
  const mutedSlate: [number, number, number] = [100, 116, 139]; // #64748B
  const emeraldGreen: [number, number, number] = [16, 185, 129]; // #10B981
  const bgLight: [number, number, number] = [248, 250, 252]; // #F8FAFC
  const borderLight: [number, number, number] = [226, 232, 240]; // #E2E8F0

  // =========================================================================
  // PAGE 1: EXECUTIVE DOSSIER, METRICS & VISUAL SKILL CHARTS
  // =========================================================================

  // Top Header Banner
  doc.setFillColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 20, 3, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("TalentPulse • Academic Career & Curriculum Dossier", margin + 6, currentY + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Verified Market Feasibility, In-Demand Skills & Course Curriculum Guide", margin + 6, currentY + 14);

  // Metadata Badge
  doc.setFontSize(8);
  doc.text(
    `Degree: ${data.degreeLabel.split("(")[0].trim()}   |   Generated: ${new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}`,
    pageWidth - margin - 6,
    currentY + 11,
    { align: "right" }
  );

  currentY += 26;

  // 4 Executive KPI Metric Cards
  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  const cardHeight = 22;

  const kpis = [
    {
      title: "ELIGIBLE OPENINGS",
      value: `${data.eligibleJobsCount.toLocaleString()}`,
      sub: `${data.eligibilityRate}% of total market`,
      color: primaryIndigo,
    },
    {
      title: "FRESHER ACCESSIBLE",
      value: `${data.fresherJobsCount.toLocaleString()}`,
      sub: `${data.fresherRate}% accessible (0-1y)`,
      color: emeraldGreen,
    },
    {
      title: "TOP HIRING DOMAIN",
      value: data.topCategories[0]?.category.split("&")[0].trim() || "Data Analytics",
      sub: `${data.topCategories[0]?.percentage || 0}% of all vacancies`,
      color: [217, 119, 6] as [number, number, number], // Amber
    },
    {
      title: "CORE #1 SKILL",
      value: data.topSkills[0]?.name || "SQL",
      sub: `Demanded in ${data.topSkills[0]?.percentage || 0}% jobs`,
      color: [147, 51, 234] as [number, number, number], // Violet
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = margin + index * (cardWidth + 3);
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, "FD");

    // Title
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(kpi.title, x + 3, currentY + 5);

    // Value
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, currentY + 12);

    // Subtitle
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(kpi.sub, x + 3, currentY + 17);
  });

  currentY += cardHeight + 8;

  // Two-Column Section: Category Distribution (Left) & Top Skills (Right)
  const colWidth = (pageWidth - margin * 2 - 6) / 2;
  const colHeight = 66; // Increased to 66mm to give ample breathing room for 5 bars

  // Left Card: Categories Distribution
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(margin, currentY, colWidth, colHeight, 2, 2, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`Available Job Categories (${data.degree.toUpperCase()})`, margin + 4, currentY + 7);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
  doc.text("Share of verified openings across technical fields", margin + 4, currentY + 12);

  // Render Category Bars
  let catY = currentY + 18;
  data.topCategories.slice(0, 5).forEach((cat) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(cat.category, margin + 4, catY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(`${cat.count} jobs (${cat.percentage}%)`, margin + colWidth - 4, catY, { align: "right" });

    // Background Bar
    doc.setFillColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.roundedRect(margin + 4, catY + 2, colWidth - 8, 2.5, 1, 1, "F");

    // Filled Bar
    doc.setFillColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    const fillW = Math.max(3, ((colWidth - 8) * cat.percentage) / 100);
    doc.roundedRect(margin + 4, catY + 2, fillW, 2.5, 1, 1, "F");

    catY += 9;
  });

  // Right Card: Top Skills Ranking
  const rightX = margin + colWidth + 6;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(rightX, currentY, colWidth, colHeight, 2, 2, "FD");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text("Top In-Demand Skills to Learn", rightX + 4, currentY + 7);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
  doc.text("Pure technical skills demanded across live postings", rightX + 4, currentY + 12);

  // Render Skill Bars
  let skillY = currentY + 18;
  data.topSkills.slice(0, 6).forEach((skill, idx) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(`#${idx + 1}  ${skill.name}`, rightX + 4, skillY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(`${skill.percentage}% frequency`, rightX + colWidth - 4, skillY, { align: "right" });

    // Background Bar
    doc.setFillColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.roundedRect(rightX + 4, skillY + 2, colWidth - 8, 2.2, 1, 1, "F");

    // Filled Bar
    doc.setFillColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
    const fillW = Math.max(3, ((colWidth - 8) * skill.percentage) / 100);
    doc.roundedRect(rightX + 4, skillY + 2, fillW, 2.2, 1, 1, "F");

    skillY += 7.2;
  });

  currentY += colHeight + 8;

  // Determine Active Track 1 Course based on selection or highest market share
  const activeCode = (selectedCategory || data.topCategories[0]?.code || "DA").toUpperCase();
  const track1Course =
    data.courseCurriculums.find((c) => c.code.toUpperCase() === activeCode) ||
    data.courseCurriculums[0];

  // Determine Dynamic Track 2 (Second Option: Next Highest Category)
  const otherCats = data.topCategories.filter(
    (c) => c.code.toUpperCase() !== activeCode && c.code !== "Other"
  );
  const nextHighestCat = otherCats[0] || data.topCategories[1] || data.topCategories[0];
  const track2Course =
    data.courseCurriculums.find((c) => c.code.toUpperCase() === nextHighestCat?.code.toUpperCase()) ||
    data.courseCurriculums[1] ||
    data.courseCurriculums[0];

  // Targeted Course 1 Card (Page 1)
  if (track1Course) {
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 54, 2, 2, "FD");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.text(`Track 1: Primary High-Demand Path — ${track1Course.title}`, margin + 4, currentY + 6);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    // WRAP OVERVIEW TEXT to prevent running off the edge!
    const track1OverviewLines = doc.splitTextToSize(track1Course.overview, pageWidth - margin * 2 - 8);
    doc.text(track1OverviewLines, margin + 4, currentY + 11);

    // Module Topics Grid in 2 Columns
    const modColWidth = (pageWidth - margin * 2 - 8) / 2;
    let modY = currentY + 17;

    track1Course.modules.slice(0, 4).forEach((mod, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);
      const mx = margin + 4 + colIdx * (modColWidth + 4);
      const my = modY + rowIdx * 17;

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(`• ${mod.moduleName}`, mx, my);

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
      const topicText = mod.topics.slice(0, 3).join(", ");
      doc.text(doc.splitTextToSize(topicText, modColWidth - 4), mx + 2, my + 4);
    });
  }

  // Footer for Page 1
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
  doc.text("TalentPulse Job Intelligence Platform  •  Page 1 of 2", pageWidth / 2, pageHeight - 8, { align: "center" });

  // =========================================================================
  // PAGE 2: DYNAMIC TRACK 2 (SECOND OPTION) & VERIFIED MATCHING JOBS DIRECTORY
  // =========================================================================
  doc.addPage();
  currentY = 16;

  // Header Banner for Page 2
  doc.setFillColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 12, 2, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Track 2: Alternative High-Demand Path — ${track2Course.title}`, margin + 6, currentY + 7.5);

  currentY += 18;

  // Track 2 Detail Card
  if (track2Course) {
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
    doc.roundedRect(margin, currentY, pageWidth - margin * 2, 42, 2, 2, "FD");

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(emeraldGreen[0], emeraldGreen[1], emeraldGreen[2]);
    doc.text(
      `Specialization Option 2: ${track2Course.title} (${nextHighestCat ? nextHighestCat.percentage + "% hiring volume" : track2Course.badge})`,
      margin + 4,
      currentY + 6
    );

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    // WRAP OVERVIEW TEXT to prevent running off the edge!
    const track2OverviewLines = doc.splitTextToSize(track2Course.overview, pageWidth - margin * 2 - 8);
    doc.text(track2OverviewLines, margin + 4, currentY + 11);

    // Track 2 Modules
    const modColWidth = (pageWidth - margin * 2 - 8) / 2;
    let modY = currentY + 17;

    track2Course.modules.slice(0, 4).forEach((mod, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);
      const mx = margin + 4 + colIdx * (modColWidth + 4);
      const my = modY + rowIdx * 12;

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      doc.text(`• ${mod.moduleName}`, mx, my);

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
      const topicText = mod.topics.slice(0, 2).join(", ");
      doc.text(doc.splitTextToSize(topicText, modColWidth - 4), mx + 2, my + 4);
    });

    currentY += 46;
  }

  // Section Heading: Verified Openings Directory Filtered by Category
  const filterCatCode = (selectedCategory || activeCode).toUpperCase();
  const matchedCatName =
    data.topCategories.find((c) => c.code.toUpperCase() === filterCatCode)?.category || filterCatCode;

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`Verified Live Job Openings: ${matchedCatName} (${data.degree.toUpperCase()})`, margin, currentY + 4);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
  doc.text("Direct verified openings from LinkedIn, Naukri, and Indeed welcoming this qualification", margin, currentY + 8);

  currentY += 12;

  // Filter Sample Jobs to strictly match the target category (No Full Stack in DA!)
  const filteredJobs = data.sampleJobs.filter(
    (j) => j.category_code && j.category_code.toUpperCase() === filterCatCode
  );
  const jobsToDisplay = (filteredJobs.length > 0 ? filteredJobs : data.sampleJobs).slice(0, 10);

  // AutoTable: Curated Jobs with wide column 3 so 'Fresher (0y)' never wraps
  const tableRows = jobsToDisplay.map((job) => [
    job.title,
    job.company,
    job.city,
    job.min_exp_years === null
      ? "Not Specified"
      : job.min_exp_years === 0
      ? "Fresher (0y)"
      : `${job.min_exp_years}-${job.max_exp_years ?? job.min_exp_years} yrs`,
    job.skills.slice(0, 4).join(", "),
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [["Role Title", "Company", "Location", "Experience", "Key Demanded Skills"]],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: primaryIndigo,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: darkSlate,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: "bold" },
      1: { cellWidth: 36 },
      2: { cellWidth: 26 },
      3: { cellWidth: 24 }, // 24mm width so 'Fresher (0y)' fits on a single line!
      4: { cellWidth: "auto" },
    },
  });

  // Footer for Page 2
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
  doc.text("TalentPulse Job Intelligence Platform  •  Page 2 of 2", pageWidth / 2, pageHeight - 8, { align: "center" });

  // Directly download file without print dialog
  const fileName = `${data.degree.toUpperCase()}_Career_Curriculum_Report.pdf`;
  doc.save(fileName);
}
