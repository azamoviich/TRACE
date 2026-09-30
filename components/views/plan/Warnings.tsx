import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Language } from '../../../types';
import { tr } from '../../../constants';

// Keys come from planEngine.buildSuggestion.
export function warningText(key: string, lang: Language): string {
  switch (key) {
    case 'ly_insufficient':
      return tr(lang, 'За прошлый год мало данных — план построен по текущему темпу.', 'Too little data for last year — the plan uses the current pace.', 'O‘tgan yil uchun ma’lumot kam — reja joriy sur’at bo‘yicha tuzildi.');
    case 'trend_above_ly':
      return tr(lang, 'Сейчас вы продаёте заметно больше, чем год назад (>15%). Возможно, лучше взять за основу текущий темп.', 'You are selling well above last year (>15%). The current pace may be a better baseline.', 'Hozir o‘tgan yildan ancha ko‘p sotyapsiz (>15%). Joriy sur’atni asos qilish yaxshiroq bo‘lishi mumkin.');
    case 'trend_below_ly':
      return tr(lang, 'Сейчас вы продаёте заметно меньше, чем год назад (>15%). План от прошлого года может быть нереалистичным.', 'You are selling well below last year (>15%). A last-year plan may be unrealistic.', 'Hozir o‘tgan yildan ancha kam sotyapsiz (>15%). O‘tgan yilga asoslangan reja real bo‘lmasligi mumkin.');
    case 'ramadan_shift':
      return tr(lang, 'Рамадан в этом месяце приходится на другие дни, чем год назад — сравнение с прошлым годом может искажать план.', 'Ramadan falls on different days than last year — the last-year comparison may skew the plan.', 'Ramazon bu oyda o‘tgan yildagidan boshqa kunlarga to‘g‘ri keladi — o‘tgan yil bilan solishtirish rejani buzishi mumkin.');
    case 'little_history':
      return tr(lang, 'Мало истории продаж — проверьте цифры вручную.', 'Little sales history — double-check the numbers.', 'Savdo tarixi kam — raqamlarni qo‘lda tekshiring.');
    case 'no_cogs':
      return tr(lang, 'В iiko не заполнена себестоимость блюд — фудкост не рассчитан, укажите его сами.', 'Dish costs are not set up in iiko — food cost could not be calculated, enter it yourself.', 'iiko’da taomlar tannarxi kiritilmagan — tannarx foizini o‘zingiz kiriting.');
    default:
      return key;
  }
}

export const WarningList: React.FC<{ lang: Language; warnings: string[] }> = ({ lang, warnings }) => {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map(w => (
        <div key={w} className="flex items-start gap-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-[12px] leading-snug">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{warningText(w, lang)}</span>
        </div>
      ))}
    </div>
  );
};
