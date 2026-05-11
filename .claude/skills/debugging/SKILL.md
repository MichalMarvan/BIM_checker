# Debugging

Systematický postup pro řešení bugů:

1. **Reprodukuj** – ověř že bug existuje a je reprodukovatelný
2. **Izoluj** – najdi minimální případ kdy se bug projeví
3. **Analyzuj** – najdi root cause (ne symptom)
4. **Oprav** – minimální fix který řeší příčinu
5. **Ověř** – spusť testy, ověř že fix funguje
6. **Regrese** – zkontroluj že fix nezavádí nové problémy

## Anti-patterns
- Nehádej – měř a loguj
- Neopravuj symptom – hledej příčinu
- Neměň víc věcí najednou
