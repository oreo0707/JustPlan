export function toDateInputValue(date: Date) {
  return date.toISOString().split("T")[0];
}

export function getTodayDateString() {
  return toDateInputValue(new Date());
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getDaysUntil(dateString: string) {
  const today = new Date(getTodayDateString());
  const targetDate = new Date(dateString);

  const difference = targetDate.getTime() - today.getTime();
  return Math.ceil(difference / (1000 * 60 * 60 * 24));
}

export function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();

  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);

  return copy;
}

export function getWeekDays(date: Date) {
  const monday = getStartOfWeek(date);

  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);

    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      dateString: toDateInputValue(day),
      dayNumber: day.getDate(),
    };
  });
}

export function getMonthDays(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days = [];

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const current = new Date(year, month, day);

    days.push({
      label: current.toLocaleDateString("en-US", { weekday: "short" }),
      dateString: toDateInputValue(current),
      dayNumber: current.getDate(),
    });
  }

  return days;
}