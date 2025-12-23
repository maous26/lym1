// Caloric Balance - Logique de calcul pour le solde calorique disponible
// Remplace le système "Crédit Plaisir" pour plus de clarté

export interface DailyBalance {
  date: string;
  consumed: number;
  target: number;
  balance: number; // target - consumed (positif = économisé, négatif = dépassé)
  dayLabel: string;
}

export interface CaloricBalanceData {
  availableBalance: number;        // Solde total disponible (calories économisées)
  weeklyHistory: DailyBalance[];   // Historique des 7 derniers jours
  averageDailyBalance: number;     // Balance moyenne par jour
  projectedJ7Impact: 'positive' | 'neutral' | 'negative'; // Impact estimé sur J+7
  projectedWeightChange: number;   // Changement de poids estimé en grammes
  percentageOfTarget: number;      // % du crédit par rapport à l'objectif quotidien
  todayBalance: number;            // Balance du jour
  todayTarget: number;             // Objectif du jour
  todayConsumed: number;           // Consommé aujourd'hui
}

// Labels des jours en français
const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/**
 * Interface pour les repas quotidiens depuis le store
 */
interface DailyMeals {
  breakfast?: { totalNutrition?: { calories?: number } };
  lunch?: { totalNutrition?: { calories?: number } };
  snack?: { totalNutrition?: { calories?: number } };
  dinner?: { totalNutrition?: { calories?: number } };
  totalNutrition?: { calories?: number };
}

/**
 * Calcule le solde calorique disponible sur les 7 derniers jours
 * @param meals - Record des repas par date (YYYY-MM-DD)
 * @param dailyTarget - Objectif calorique journalier
 */
export function calculateCaloricBalance(
  meals: Record<string, DailyMeals>,
  dailyTarget: number
): CaloricBalanceData {
  const today = new Date();
  const weeklyHistory: DailyBalance[] = [];
  let totalBalance = 0;
  let daysWithData = 0;

  // Calculer pour les 7 derniers jours (du plus ancien au plus récent)
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    const dayMeals = meals[dateKey];

    // Calculer les calories consommées
    let consumed = 0;
    if (dayMeals) {
      // Utiliser totalNutrition si disponible
      if (dayMeals.totalNutrition?.calories) {
        consumed = dayMeals.totalNutrition.calories;
      } else {
        // Sinon, additionner les repas individuels
        consumed += dayMeals.breakfast?.totalNutrition?.calories || 0;
        consumed += dayMeals.lunch?.totalNutrition?.calories || 0;
        consumed += dayMeals.snack?.totalNutrition?.calories || 0;
        consumed += dayMeals.dinner?.totalNutrition?.calories || 0;
      }
    }

    const balance = dailyTarget - consumed;

    // Ne compter que les jours avec des données (sinon ça fausse le calcul)
    const hasData = consumed > 0;
    if (hasData) {
      totalBalance += balance;
      daysWithData++;
    }

    weeklyHistory.push({
      date: dateKey,
      consumed,
      target: dailyTarget,
      balance,
      dayLabel: DAY_LABELS[dayOfWeek],
    });
  }

  // Données du jour
  const todayKey = today.toISOString().split('T')[0];
  const todayData = weeklyHistory.find(d => d.date === todayKey);
  const todayBalance = todayData?.balance || dailyTarget;
  const todayConsumed = todayData?.consumed || 0;

  // Moyenne journalière (éviter division par zéro)
  const averageDailyBalance = daysWithData > 0 ? totalBalance / daysWithData : 0;

  // Le solde disponible est le total des calories économisées (seulement les positives pour éviter l'accumulation de dettes)
  // On peut choisir de prendre le total ou seulement les jours avec surplus
  const availableBalance = Math.max(0, totalBalance);

  // Projection J+7: basée sur la tendance moyenne
  // 7700 kcal = environ 1kg de graisse
  const projectedWeeklyImpact = averageDailyBalance * 7;
  const projectedWeightChange = Math.round((projectedWeeklyImpact / 7700) * 1000); // en grammes

  let projectedJ7Impact: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (averageDailyBalance > 100) {
    projectedJ7Impact = 'positive'; // Déficit calorique = perte de poids potentielle
  } else if (averageDailyBalance < -100) {
    projectedJ7Impact = 'negative'; // Surplus calorique = gain de poids potentiel
  }

  // Pourcentage par rapport à l'objectif quotidien
  const percentageOfTarget = dailyTarget > 0
    ? Math.min(100, Math.max(0, (availableBalance / dailyTarget) * 100))
    : 0;

  return {
    availableBalance,
    weeklyHistory,
    averageDailyBalance: Math.round(averageDailyBalance),
    projectedJ7Impact,
    projectedWeightChange,
    percentageOfTarget,
    todayBalance,
    todayTarget: dailyTarget,
    todayConsumed,
  };
}

/**
 * Génère le message selon l'état du solde
 */
export function getBalanceMessage(
  availableBalance: number,
  projectedJ7Impact: 'positive' | 'neutral' | 'negative'
): { title: string; subtitle: string; ctaText: string } {
  if (availableBalance >= 500) {
    return {
      title: 'Solde plaisir disponible',
      subtitle: 'Tu as économisé des calories cette semaine !',
      ctaText: 'Utiliser mon crédit plaisir',
    };
  }

  if (availableBalance > 0) {
    return {
      title: 'Solde plaisir disponible',
      subtitle: 'Continue comme ça pour augmenter ton crédit',
      ctaText: 'Utiliser mon crédit plaisir',
    };
  }

  return {
    title: 'Solde plaisir',
    subtitle: 'Économise des calories pour débloquer ton crédit',
    ctaText: 'Voir les conseils',
  };
}
