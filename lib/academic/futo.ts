/**
 * Federal University of Technology, Owerri (FUTO): its schools and departments, for the "which course are you doing" step.
 * STATUS: compiled from public sources and general knowledge, NOT yet confirmed against the university's own pages. A school or
 * department placed wrongly only means a student picks a neighbouring one, but it must be checked and corrected before launch.
 * To correct it, edit this file (or load the verified list into the admin catalog) and the app picks it up on the next deploy.
 */
export interface SchoolDef {
  id: string;
  name: string;
  short: string;
  departments: string[];
}

export const FUTO_VERIFIED = false;
export const FUTO_MAX_LEVEL = 500;

export const FUTO_SCHOOLS: SchoolDef[] = [
  { id: "saat", short: "SAAT", name: "School of Agriculture and Agricultural Technology", departments: ["Agricultural Economics", "Agricultural Extension", "Animal Science and Technology", "Crop Science and Technology", "Fisheries and Aquaculture Technology", "Forestry and Wildlife Technology", "Food Science and Technology", "Soil Science and Technology"] },
  { id: "seet", short: "SEET", name: "School of Engineering and Engineering Technology", departments: ["Agricultural Engineering", "Biomedical Engineering", "Chemical Engineering", "Civil Engineering", "Industrial and Production Engineering", "Material and Metallurgical Engineering", "Mechanical Engineering", "Petroleum Engineering", "Polymer and Textile Engineering"] },
  { id: "seset", short: "SESET", name: "School of Electrical Systems and Engineering Technology", departments: ["Computer Engineering", "Electrical and Electronic Engineering", "Mechatronics Engineering", "Telecommunications Engineering"] },
  { id: "sict", short: "SICT", name: "School of Information and Communication Technology", departments: ["Computer Science", "Cyber Security", "Information Technology", "Software Engineering"] },
  { id: "sops", short: "SOPS", name: "School of Physical Sciences", departments: ["Chemistry", "Mathematics", "Physics", "Science Laboratory Technology", "Statistics"] },
  { id: "sobs", short: "SOBS", name: "School of Biological Sciences", departments: ["Biochemistry", "Biology", "Biotechnology", "Microbiology"] },
  { id: "soht", short: "SOHT", name: "School of Health Technology", departments: ["Dental Technology", "Environmental Health Science", "Optometry", "Prosthetics and Orthotics", "Public Health Technology", "Radiography"] },
  { id: "soes", short: "SOES", name: "School of Environmental Sciences", departments: ["Architecture", "Building", "Environmental Management", "Estate Management", "Meteorology and Climate Science", "Quantity Surveying", "Surveying and Geoinformatics", "Urban and Regional Planning"] },
  { id: "slit", short: "SLIT", name: "School of Logistics and Innovation Technology", departments: ["Logistics and Transport Technology", "Project Management Technology", "Supply Chain Management"] },
  { id: "cespess", short: "CE-sPESS", name: "Centre of Excellence in Sustainable Procurement, Environmental and Social Standards", departments: ["Sustainable Environmental Studies", "Sustainable Social Development", "Procurement Management"] },
  { id: "com", short: "COM", name: "College of Medicine", departments: ["Medicine and Surgery"] },
];
