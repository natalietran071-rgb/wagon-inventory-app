import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface DataContextType {
  locations: string[];
  loadingLocations: boolean;
  refreshLocations: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: React.ReactNode }) => {
  const [locations, setLocations] = useState<string[]>(['All']);
  const [loadingLocations, setLoadingLocations] = useState(true);

  const fetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const { data, error } = await supabase.rpc('get_location_list');
      if (error) throw error;
      if (data) {
        const locList = ['All', ...data.filter((l: any) => l.location_prefix).map((l: any) => l.location_prefix)];
        setLocations(locList);
      }
    } catch (error) {
      console.error('Lỗi khi tải danh sách vị trí:', error);
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  return (
    <DataContext.Provider value={{ locations, loadingLocations, refreshLocations: fetchLocations }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
