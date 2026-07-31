<template>
  <div class="slot-picker">
    <div v-if="loading" class="spinner"></div>
    <div v-else-if="error" class="empty-state">
      <h3>No pudimos cargar los horarios</h3>
      <p class="muted">{{ error }}</p>
    </div>

    <div v-else>
      <p class="slot-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Entrega programada · Días y horarios de {{ settingsStore.settings?.storeName || 'DistriKriss' }}
      </p>

      <div v-if="dates.length === 0" class="empty-state">
        <h3>No hay entregas disponibles esta semana</h3>
      </div>

      <div v-else class="date-slots">
        <div v-for="d in dates" :key="d.date" class="date-group">
          <div class="date-label" :class="{ selected: selectedDate === d.date }">
            <span class="date-day">{{ WEEKDAYS_SHORT[d.weekday] }}</span>
            <span class="date-num">{{ dayNum(d.date) }}</span>
          </div>
          <div class="date-slots-list">
            <button
              v-for="slot in d.slots"
              :key="slot.id"
              class="slot-chip"
              :class="{ active: selectedDate === d.date && selectedSlot === slot.id, disabled: !slot.available }"
              :disabled="!slot.available"
              @click="select(d.date, slot)"
            >
              <span class="slot-label">{{ slot.label }}</span>
              <span v-if="slot.available && slot.remaining <= 5" class="slot-low">quedan {{ slot.remaining }}</span>
              <span v-else-if="slot.available" class="slot-ok">disponible</span>
              <span v-else class="slot-full">lleno</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/client.js'
import { useSettingsStore } from '../stores/settings.js'
import { WEEKDAYS_SHORT } from '../utils/format.js'

const emit = defineEmits(['update'])

const settingsStore = useSettingsStore()
const dates = ref([])
const loading = ref(true)
const error = ref('')
const selectedDate = ref(null)
const selectedSlot = ref(null)

function dayNum(dateStr) {
  return Number(dateStr.slice(8, 10))
}

function select(date, slot) {
  selectedDate.value = date
  selectedSlot.value = slot.id
  emit('update', { date, slotId: slot.id, slotLabel: slot.label })
}

onMounted(async () => {
  try {
    const data = await api.get('/api/delivery/slots')
    dates.value = data.dates
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.slot-picker {
  margin-top: 4px;
}

.slot-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--green-mid);
  font-weight: 600;
  margin-bottom: 16px;
}

.date-slots {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.date-group {
  display: flex;
  gap: 14px;
  align-items: stretch;
}

.date-label {
  width: 64px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--gray-light);
  border-radius: var(--radius-sm);
  border: 2px solid transparent;
  padding: 8px 4px;
}

.date-label.selected {
  border-color: var(--green-dark);
  background: var(--green-dark);
  color: white;
}

.date-day {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.date-num {
  font-size: 1.3rem;
  font-weight: 900;
}

.date-slots-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.slot-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--gray-mid);
  background: white;
  transition: var(--transition);
}

.slot-chip:hover:not(.disabled) {
  border-color: var(--green-light);
}

.slot-chip.active {
  border-color: var(--green-dark);
  background: var(--green-dark);
  color: white;
}

.slot-chip.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--gray-light);
}

.slot-label {
  font-weight: 700;
  font-size: 0.88rem;
}

.slot-ok,
.slot-low {
  font-size: 0.72rem;
  color: var(--green-mid);
  font-weight: 600;
}

.slot-chip.active .slot-ok {
  color: rgba(255, 255, 255, 0.8);
}

.slot-low {
  color: #E65100;
}

.slot-full {
  font-size: 0.72rem;
  color: var(--gray);
}

@media (max-width: 480px) {
  .date-group {
    flex-direction: column;
  }

  .date-label {
    width: 100%;
    flex-direction: row;
    gap: 10px;
  }
}
</style>
