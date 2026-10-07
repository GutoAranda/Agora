import { updateSettings } from '../db/schema'
import { Button } from '../components/ui'
export default function Onboarding() {
  return (
    <div className="p-6">
      <Button variant="primary" onClick={() => void updateSettings({ onboardingDone: true })}>Começar</Button>
    </div>
  )
}
