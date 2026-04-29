import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const parseDate = (dateStr: string) => {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    const parts = dateStr.split(' ');
    if (parts.length < 3) return null;
    const day = parseInt(parts[0]);
    const monthMap: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'Mei': 4, 'Jun': 5, 'Jul': 6, 'Agu': 7, 'Sep': 8, 'Okt': 9, 'Nov': 10, 'Des': 11,
      'May': 4, 'Aug': 7, 'Oct': 9, 'Dec': 11
    };
    const month = monthMap[parts[1]] ?? 0;
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  } catch { return null; }
};

export const sanitizeId = (id: string) => id.replace(/\//g, '-').replace(/\s+/g, '_');
