import { AIReasoningChain } from '../ai-reasoning-chain';

const mockSteps = [
  {
    id: "r1",
    timestamp: "14:23:02",
    description: "Identified authentication middleware as critical security component requiring modular refactoring",
    confidence: 95,
    completed: true,
  },
  {
    id: "r2",
    timestamp: "14:23:12",
    description: "Detected hardcoded secret in token validation - security risk that requires immediate attention",
    confidence: 98,
    completed: true,
  },
  {
    id: "r3",
    timestamp: "14:23:15",
    description: "Proposed solution: Extract validation logic into separate module with environment-based configuration",
    confidence: 92,
    completed: false,
  },
];

export default function AIReasoningChainExample() {
  return <AIReasoningChain steps={mockSteps} />;
}
