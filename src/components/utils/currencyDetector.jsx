// Detect user's currency based on location
export const detectUserCurrency = async () => {
  try {
    // Try to get user's timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Map timezones to currencies
    const currencyMap = {
      // India
      'Asia/Kolkata': { symbol: '₹', code: 'INR', name: 'Rupees' },
      'Asia/Calcutta': { symbol: '₹', code: 'INR', name: 'Rupees' },
      
      // Canada
      'America/Toronto': { symbol: 'CA$', code: 'CAD', name: 'Canadian Dollars' },
      'America/Vancouver': { symbol: 'CA$', code: 'CAD', name: 'Canadian Dollars' },
      'America/Edmonton': { symbol: 'CA$', code: 'CAD', name: 'Canadian Dollars' },
      'America/Winnipeg': { symbol: 'CA$', code: 'CAD', name: 'Canadian Dollars' },
      'America/Halifax': { symbol: 'CA$', code: 'CAD', name: 'Canadian Dollars' },
      
      // USA
      'America/New_York': { symbol: '$', code: 'USD', name: 'Dollars' },
      'America/Chicago': { symbol: '$', code: 'USD', name: 'Dollars' },
      'America/Los_Angeles': { symbol: '$', code: 'USD', name: 'Dollars' },
      'America/Denver': { symbol: '$', code: 'USD', name: 'Dollars' },
      
      // UK
      'Europe/London': { symbol: '£', code: 'GBP', name: 'Pounds' },
      
      // Europe
      'Europe/Paris': { symbol: '€', code: 'EUR', name: 'Euros' },
      'Europe/Berlin': { symbol: '€', code: 'EUR', name: 'Euros' },
      'Europe/Rome': { symbol: '€', code: 'EUR', name: 'Euros' },
      'Europe/Madrid': { symbol: '€', code: 'EUR', name: 'Euros' },
      
      // Australia
      'Australia/Sydney': { symbol: 'A$', code: 'AUD', name: 'Australian Dollars' },
      'Australia/Melbourne': { symbol: 'A$', code: 'AUD', name: 'Australian Dollars' },
      
      // Singapore
      'Asia/Singapore': { symbol: 'S$', code: 'SGD', name: 'Singapore Dollars' },
      
      // UAE
      'Asia/Dubai': { symbol: 'AED', code: 'AED', name: 'Dirhams' },
      
      // Pakistan
      'Asia/Karachi': { symbol: '₨', code: 'PKR', name: 'Rupees' },
      
      // Bangladesh
      'Asia/Dhaka': { symbol: '৳', code: 'BDT', name: 'Taka' },
      
      // Sri Lanka
      'Asia/Colombo': { symbol: '₨', code: 'LKR', name: 'Rupees' },
    };
    
    const currency = currencyMap[timezone] || { symbol: '$', code: 'USD', name: 'Dollars' };
    return currency;
  } catch (error) {
    // Default to USD if detection fails
    return { symbol: '$', code: 'USD', name: 'Dollars' };
  }
};

// Format currency amount
export const formatCurrency = (amount, currency) => {
  return `${currency.symbol}${amount}`;
};