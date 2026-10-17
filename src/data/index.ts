import { DataSource } from './DataSource';
import { supabaseDataSource } from './supabaseDataSource';

// Single entry point for application data access - Real Supabase DataSource
export const dataSource: DataSource = supabaseDataSource;

export * from './DataSource';
export * from './supabaseClient';
export { supabaseDataSource };
