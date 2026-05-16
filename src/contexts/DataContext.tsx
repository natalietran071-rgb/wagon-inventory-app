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
      // Try RPC first
      const { data, error } = await supabase.rpc('get_location_list');
      if (!error && data && data.length > 0) {
        const locList = ['All', ...data.filter((l: any) => l.location_prefix).map((l: any) => l.location_prefix)];
        setLocations(locList);
      } else {
        // Fallback: fetch unique pos values directly from inventory table
        const PAGE = 1000;
        let allPos: string[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: posData } = await supabase
            .from('inventory')
            .select('pos')
            .not('pos', 'is', null)
            .not('pos', 'eq', '')
            .order('pos')
            .range(page * PAGE, (page + 1) * PAGE - 1);
          if (posData && posData.length > 0) {
            allPos = allPos.concat(posData.map((p: any) => p.pos));
            hasMore = posData.length === PAGE;
            page++;
          } else {
            hasMore = false;
          }
        }
        // Extract unique prefixes (part before first '-')
        const prefixSet = new Set<string>();
        allPos.forEach(p => {
          if (p) {
            const prefix = p.split('-')[0].trim();
            if (prefix) prefixSet.add(prefix);
          }
        });
        const sortedPrefixes = Array.from(prefixSet).sort();
        setLocations(['All', ...sortedPrefixes]);
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
