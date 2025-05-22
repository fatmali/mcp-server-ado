import { logger } from '../utils/logger.js';

/**
 * This service analyzes work item descriptions to extract mood information,
 * suitable for recommending appropriate music.
 */
export class WorkItemAnalyzer {
    // Positive keywords that indicate high energy, productivity
    private positiveKeywords = [
        'feature', 'create', 'implement', 'enhancement', 'improvement',
        'opportunity', 'optimize', 'success', 'achievement', 'innovation'
    ];
    
    // Negative keywords that might indicate stress or urgency
    private negativeKeywords = [
        'bug', 'error', 'fix', 'issue', 'problem', 'urgent', 'critical',
        'deadline', 'failure', 'broken', 'crash', 'defect'
    ];
    
    // Keywords indicating focused work
    private focusKeywords = [
        'analyze', 'research', 'document', 'review', 'complex', 'detailed',
        'specification', 'design', 'architecture', 'planning', 'investigation'
    ];
    
    // Keywords indicating creative work
    private creativityKeywords = [
        'design', 'create', 'new', 'innovative', 'visual', 'user interface',
        'user experience', 'brainstorm', 'creative', 'redesign', 'enhance'
    ];
    
    constructor() {
        // No initialization needed
    }
    
    /**
     * Count occurrences of keywords in text
     */
    private countKeywords(text: string, keywords: string[]): number {
        return keywords.reduce((count, keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = text.match(regex);
            return count + (matches ? matches.length : 0);
        }, 0);
    }
    
    /**
     * Calculate energy level based on positive and negative keyword counts
     */
    private calculateEnergyLevel(positiveCount: number, negativeCount: number, totalWords: number): number {
        const baseEnergy = 0.5; // Default energy level
        
        if (totalWords === 0) return baseEnergy;
        
        // Negative keywords increase energy (urgency), positive keywords create balanced energy
        const urgencyFactor = negativeCount / Math.max(totalWords / 10, 1);
        const positiveFactor = positiveCount / Math.max(totalWords / 10, 1);
        
        // Combine factors, with more weight on urgency if present
        return Math.min(1, Math.max(0, 
            baseEnergy + (urgencyFactor * 0.5) + (positiveFactor * 0.3)
        ));
    }
    
    /**
     * Normalize a count to a 0-1 score
     */
    private normalizeScore(count: number, totalWords: number): number {
        if (totalWords === 0) return 0.5;
        
        // Calculate score as a percentage of total words, capped at 1.0
        return Math.min(1, count / Math.max(totalWords / 5, 3));
    }
    
    /**
     * Determine mood based on energy and negative/positive balance
     */
    private determineMood(energyLevel: number, isNegative: boolean): string {
        if (isNegative) {
            if (energyLevel > 0.7) return 'urgent';
            if (energyLevel > 0.5) return 'tense';
            return 'focused';
        } else {
            if (energyLevel > 0.7) return 'energetic';
            if (energyLevel > 0.5) return 'productive';
            return 'calm';
        }
    }

    async analyzeMood(workItemDescription: string): Promise<{
        mood: string;
        energyLevel: number;
        focus: number;
        creativity: number;
        taskComplexity: number;
    }> {
        try {
            const text = workItemDescription.toLowerCase();
            
            // Count occurrences of different keyword types
            const positiveCount = this.countKeywords(text, this.positiveKeywords);
            const negativeCount = this.countKeywords(text, this.negativeKeywords);
            const focusCount = this.countKeywords(text, this.focusKeywords);
            const creativityCount = this.countKeywords(text, this.creativityKeywords);
            
            // Calculate normalized scores (0-1)
            const totalWords = text.split(/\s+/).length;
            const energyScore = this.calculateEnergyLevel(positiveCount, negativeCount, totalWords);
            const focusScore = this.normalizeScore(focusCount, totalWords);
            const creativityScore = this.normalizeScore(creativityCount, totalWords);
            
            // Task complexity is derived from description length and focus score
            const complexityScore = Math.min(1, Math.max(0, 
                (totalWords / 200) * 0.5 + focusScore * 0.5
            ));
            
            // Determine mood
            const mood = this.determineMood(energyScore, negativeCount > positiveCount);
            
            return {
                mood,
                energyLevel: energyScore,
                focus: focusScore,
                creativity: creativityScore,
                taskComplexity: complexityScore
            };
        } catch (error) {
            logger.error('Error analyzing mood:', error);
            return {
                mood: "neutral",
                energyLevel: 0.5,
                focus: 0.5,
                creativity: 0.5,
                taskComplexity: 0.5
            };
        }
    }
}
