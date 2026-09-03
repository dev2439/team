export type ResumeEmployment = {
  company: string;
  role: string;
  location: string;
  period: string;
  description: string;
};

export type ResumeEducation = {
  university: string;
  degree: string;
  period: string;
  description: string;
};

export type ResumeProfile = {
  title: string;
  overview: string;
  skills: string[];
  employment: ResumeEmployment[];
  education: ResumeEducation[];
  hourlyRate: string;
};
