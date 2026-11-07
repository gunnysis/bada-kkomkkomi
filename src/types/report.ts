export interface FieldReportData {
  pointId?: string;
  pointName?: string;
  lat: number;
  lng: number;
  reporterName?: string;
  memo: string;
  photos: string[]; // Base64 data URLs
  createdAt: string;
}

export interface EmailReportPayload {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}
