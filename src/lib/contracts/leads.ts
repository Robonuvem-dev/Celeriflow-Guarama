export type LeadInput = {
  name: string; role?: string; organization: string; city: string; state: string; email: string;
  phone?: string; moduleInterest?: string; message?: string; consent: boolean;
};

export type LeadRecord = {
  id: string; name: string; role: string | null; organization: string; city: string; state: string; email: string;
  phone: string | null; moduleInterest: string | null; message: string | null; consent: boolean;
  createdAt: Date; updatedAt: Date;
};
