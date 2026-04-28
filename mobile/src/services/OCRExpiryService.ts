export interface OCRResult {
  month: string;
  year: string;
  raw: string;
  isReliable: boolean;
}

export const OCRExpiryService = {
  parseExpiryDate: (text: string): { month: string; year: string } | null => {
    const formatYear = (y: string) => (y.length === 2 ? '20' + y : y);
    const isYearValid = (y: string) => {
      if (y.length === 4) return y.startsWith('20');
      if (y.length === 2) return parseInt(y) >= 25;
      return false;
    };

    const monthsMap: { [key: string]: string } = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    };

    const monthPattern = '(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*';

    // 1. First, check for unambiguous Text Months (Jan, February etc.)
    // Check Month Day Year first: JAN 23 2027
    const mdy = new RegExp(`(?:^|[^A-Z0-9])${monthPattern}[./\\-\\s,]+\\d{1,2}[./\\-\\s,]+(\\d{2,4})(?![0-9])`, 'i');
    let tMatch = text.match(mdy);
    if (tMatch && isYearValid(tMatch[2])) {
      return {
        month: monthsMap[tMatch[1].toUpperCase().substring(0, 3)],
        year: formatYear(tMatch[2])
      };
    }

    // Check [Day] Month Year: 23 JUN 2027 or JUN 2027 or MAY/27
    const dmy = new RegExp(`(?:^|[^A-Z0-9])(?:(\\d{1,2})[./\\-\\s,]+)?${monthPattern}[./\\-\\s,]+(\\d{2,4})(?![0-9])`, 'i');
    tMatch = text.match(dmy);
    if (tMatch) {
      const day = tMatch[1];
      const month = monthsMap[tMatch[2].toUpperCase().substring(0, 3)];
      const yearStr = tMatch[3];
      
      if (isYearValid(yearStr)) {
        return { month, year: formatYear(yearStr) };
      }
      
      // If year is invalid but we have "Day Month", it might be a Day-Month capture with trailing noise
      if (day && parseInt(day) <= 31) {
        return { month, year: new Date().getFullYear().toString() };
      }
    }

    // Check Day Month (No Year): 23 JUN -> Presume current year
    const dm = new RegExp(`(?:^|[^A-Z0-9])(\\d{1,2})[./\\-\\s,]+${monthPattern}(?![A-Z0-9])`, 'i');
    tMatch = text.match(dm);
    if (tMatch) {
      const month = monthsMap[tMatch[2].toUpperCase().substring(0, 3)];
      const currentYear = new Date().getFullYear();
      return { month, year: currentYear.toString() };
    }

    // 2. Generic Numeric Pattern: \d{2}.?\d{2}.?\d{2,4}
    const genericNumeric = /(?:^|[^0-9])(\d{2})[./\-\s]?(\d{2})[./\-\s]?(\d{2,4})(?![0-9])/g;
    const matches = Array.from(text.matchAll(genericNumeric));
    
    for (const m of matches) {
      const d1 = parseInt(m[1]);
      const d2 = parseInt(m[2]);
      const yearStr = m[3];
      const yearPrefix = yearStr.length === 4 ? yearStr.substring(0, 2) : '';
      
      const isYearValidNum = yearStr.length === 2 || (yearPrefix === '20' || yearPrefix === '21');
      
      if (d1 <= 31 && d2 <= 31 && (d1 <= 12 || d2 <= 12) && isYearValidNum) {
        if (d1 > 12) return { month: m[2].padStart(2, '0'), year: formatYear(yearStr) };
        if (d2 > 12) return { month: m[1].padStart(2, '0'), year: formatYear(yearStr) };
        return { month: m[2].padStart(2, '0'), year: formatYear(yearStr) };
      }
    }

    return null;
  }
};
