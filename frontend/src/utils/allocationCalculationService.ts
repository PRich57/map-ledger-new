import { RatioAllocation, AllocationResult } from '../types';

export class AllocationCalculationService {
  private static async getSourceValue(_accountId: string, _periodId: string): Promise<number> {
    // Simulate API call to get source value
    await new Promise(resolve => setTimeout(resolve, 500));
    return 10000; // Sample value
  }

  private static async getRatioMetrics(_metricIds: string[], _periodId: string): Promise<Record<string, number>> {
    // Simulate API call to get ratio metrics
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      '1': 75,
      '2': 25,
    };
  }

  static async calculatePeriodAllocations(
    periodId: string,
    mappings: RatioAllocation[]
  ): Promise<AllocationResult[]> {
    const results: AllocationResult[] = [];
    
    for (const mapping of mappings) {
      // 1. Get source account value
      const sourceValue = await this.getSourceValue(mapping.sourceAccount.id, periodId);
      
      // 2. Get ratio metrics for all target datapoints
      const ratioMetrics = await this.getRatioMetrics(
        mapping.targetDatapoints.map(dp => dp.ratioMetric.id),
        periodId
      );
      
      // 3. Calculate ratios
      const totalMetricValue = Object.values(ratioMetrics).reduce((sum: number, val: number) => sum + val, 0);
      const allocations = mapping.targetDatapoints.map(dp => {
        const metricValue = ratioMetrics[dp.ratioMetric.id] || 0;
        const percentage = metricValue / totalMetricValue;
        return {
          datapointId: dp.datapointId,
          value: sourceValue * percentage,
          percentage: percentage * 100
        };
      });
      
      results.push({
        periodId,
        sourceValue,
        allocations
      });
    }
    
    return results;
  }
}