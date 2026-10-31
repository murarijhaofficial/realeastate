export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'SALES_MANAGER' | 'SALES_EXECUTIVE' | 'BROKER' | 'ACCOUNTS';

export interface User { id: string; full_name: string; email: string; role: Role; permissions: string[] }
export interface Project {
  id: string;
  project_name: string;
  project_code: string;
  project_type?: string;
  status: string;
  total_land_area?: number;
  area_unit?: string;
  survey_number?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  highlights?: string[];
}
export interface Plot {
  id: string;
  plot_number: string;
  plot_type?: string;
  status: string;
  area_sq_yard?: number;
  area_sq_feet?: number;
  length?: number;
  width?: number;
  direction?: string;
  road_width?: number;
  current_price?: number;
  north_boundary?: string;
  south_boundary?: string;
  east_boundary?: string;
  west_boundary?: string;
}
export interface PlotGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}
export interface LayoutPlot {
  plot_id: string;
  plot_number: string;
  geometry: PlotGeometry;
  status: string;
}
export interface ProjectLayout {
  id: string;
  layout_name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version_number: number;
  image_url?: string;
  plots: LayoutPlot[];
}
export interface Lead { id: string; customer_name: string; mobile: string; project_name: string; source: string; lead_status: string; created_at: string }
export interface Booking { id: string; booking_code: string; project_name: string; plot_number: string; customer_name: string; booking_status: string; booking_amount?: number; submitted_at: string }
export interface Dashboard {
  projects: number;
  total: number;
  available: number;
  hold: number;
  booked: number;
  pending_bookings: number;
}

export const roleLabel = (role: string) => role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
export const money = (value?: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value ?? 0);
