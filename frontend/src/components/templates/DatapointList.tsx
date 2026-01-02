import { Datapoint, COATemplate } from '../../types';
import { Edit, Trash2, GripVertical, Calculator, Info } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface DatapointListProps {
  template: COATemplate;
  datapoints: Datapoint[];
  onEdit: (datapoint: Datapoint) => void;
  onDelete: (datapointId: string) => void;
  onReorder: (datapointIds: string[]) => void;
}

export default function DatapointList({
  template,
  datapoints,
  onEdit,
  onDelete,
  onReorder,
}: DatapointListProps) {
  const sortedDatapoints = [...datapoints].sort((a, b) => a.sortOrder - b.sortOrder);

  const getFunctionalGroupName = (id: string) => {
    const group = template.functionalGroups.find(g => g.id === id);
    return group ? `${group.name} (${group.code})` : 'Unknown';
  };

  const getOperationalGroupName = (id: string) => {
    const group = template.operationalGroups.find(g => g.id === id);
    return group ? `${group.name} (${group.code})` : 'Unknown';
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(sortedDatapoints);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onReorder(items.map(item => item.id));
  };

  const getTypeChip = (type: Datapoint['type']) => {
    const styles = {
      Financial: 'bg-blue-100 text-blue-800',
      Operational: 'bg-green-100 text-green-800',
      Calculated: 'bg-purple-100 text-purple-800'
    };

    const icons = {
      Financial: null,
      Operational: null,
      Calculated: <Calculator className="h-3 w-3 mr-1" />
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
        {icons[type]}
        {type}
      </span>
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="datapoints">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="overflow-x-auto">
            <table className="min-w-full table-compact divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-8"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Groups
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedDatapoints.map((datapoint, index) => (
                  <Draggable key={datapoint.id} draggableId={datapoint.id} index={index}>
                    {(provided) => (
                      <tr
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="hover:bg-gray-50 group"
                      >
                        <td className="px-2" {...provided.dragHandleProps}>
                          <GripVertical className="h-5 w-5 text-gray-400" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-900">{datapoint.accountName}</div>
                            <div className="text-sm text-gray-500 flex items-center">
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                                {datapoint.coreGLAccount}
                              </span>
                            </div>
                            {datapoint.accountDescription && (
                              <div className="text-sm text-gray-500 flex items-center">
                                <Info className="h-3 w-3 mr-1" />
                                {datapoint.accountDescription}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            {getTypeChip(datapoint.type)}
                            {datapoint.type === 'Calculated' && datapoint.formula && (
                              <div className="text-xs text-gray-500 font-mono bg-gray-50 p-1 rounded">
                                {datapoint.formula}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-sm">
                              <span className="text-gray-500">Type:</span>{' '}
                              <span className="font-medium">{datapoint.accountType}</span>
                            </div>
                            <div className="text-sm">
                              <span className="text-gray-500">Balance:</span>{' '}
                              <span className="font-medium">{datapoint.balanceType}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <div className="text-sm px-2 py-1 bg-blue-50 rounded-md">
                              {getFunctionalGroupName(datapoint.functionalGroupId)}
                            </div>
                            <div className="text-sm px-2 py-1 bg-green-50 rounded-md">
                              {getOperationalGroupName(datapoint.operationalGroupId)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => onEdit(datapoint)}
                              className="text-indigo-600 hover:text-indigo-900 transition-colors"
                              title="Edit datapoint"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => onDelete(datapoint.id)}
                              className="text-red-600 hover:text-red-900 transition-colors"
                              title="Delete datapoint"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            </table>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
