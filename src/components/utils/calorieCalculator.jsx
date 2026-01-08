/**
 * Calculate personalized daily calorie needs based on user profile
 * Uses Mifflin-St Jeor equation adjusted for diabetes management
 */
export function calculateDailyCalories(userProfile) {
  if (!userProfile) return 1800; // Default fallback

  const { age, weight, height, gender, activity_level, diabetes_type } = userProfile;

  // Validate required fields
  if (!age || !weight || !height || !gender) {
    return 1800; // Default if missing data
  }

  // Mifflin-St Jeor Equation for BMR (Basal Metabolic Rate)
  let bmr;
  if (gender === 'male') {
    bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
  } else if (gender === 'female') {
    bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
  } else {
    // Non-binary/other - use average
    bmr = (10 * weight) + (6.25 * height) - (5 * age) - 78;
  }

  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,          // Little or no exercise
    lightly_active: 1.375,   // Light exercise 1-3 days/week
    moderately_active: 1.55, // Moderate exercise 3-5 days/week
    very_active: 1.725       // Hard exercise 6-7 days/week
  };

  const multiplier = activityMultipliers[activity_level] || 1.375;
  let tdee = bmr * multiplier; // Total Daily Energy Expenditure

  // Diabetes-specific adjustments
  if (diabetes_type === 'type1') {
    // Type 1: Focus on consistency, no major reduction
    tdee = Math.round(tdee);
  } else if (diabetes_type === 'type2' || diabetes_type === 'prediabetes') {
    // Type 2/Prediabetes: Often benefit from moderate calorie deficit for weight management
    const bmi = weight / Math.pow(height / 100, 2);
    if (bmi > 25) {
      // Reduce by 10-15% for weight loss if overweight
      tdee = Math.round(tdee * 0.88);
    } else {
      tdee = Math.round(tdee);
    }
  } else if (diabetes_type === 'gestational') {
    // Gestational: Maintain adequate nutrition, no deficit
    tdee = Math.round(tdee);
  }

  // Safety bounds
  const minCalories = gender === 'male' ? 1500 : 1200;
  const maxCalories = 3000;
  
  return Math.max(minCalories, Math.min(maxCalories, tdee));
}

/**
 * Get calorie distribution for diabetes management
 */
export function getCalorieDistribution(totalCalories) {
  return {
    carbs_percentage: 40, // 40% carbs (lower for diabetes)
    protein_percentage: 30, // 30% protein
    fat_percentage: 30,     // 30% healthy fats
    carbs_grams: Math.round((totalCalories * 0.40) / 4),
    protein_grams: Math.round((totalCalories * 0.30) / 4),
    fat_grams: Math.round((totalCalories * 0.30) / 9),
    fiber_grams: Math.round(totalCalories / 70) // ~25-35g fiber per 2000 cal
  };
}