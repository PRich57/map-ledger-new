import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useTemplateStore } from '../store/templateStore';
import { Plus, ArrowLeft } from 'lucide-react';
import TemplateList from '../components/templates/TemplateList';
import TemplateForm from '../components/templates/TemplateForm';
import DatapointForm from '../components/templates/DatapointForm';
import DatapointList from '../components/templates/DatapointList';
import TemplateImportForm from '../components/templates/TemplateImportForm';
import { COATemplate, Datapoint } from '../types';

export default function Templates() {
  const { user } = useAuthStore();
  const { 
    templates, 
    datapoints,
    addTemplate, 
    updateTemplate, 
    deleteTemplate,
    addDatapoint,
    updateDatapoint,
    deleteDatapoint,
    reorderDatapoints
  } = useTemplateStore();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<COATemplate | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState<COATemplate | undefined>();
  const [isDatapointFormOpen, setIsDatapointFormOpen] = useState(false);
  const [editingDatapoint, setEditingDatapoint] = useState<Datapoint | undefined>();
  
  if (user?.role !== 'super') {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 text-gray-700 shadow">
          Access denied
        </div>
      </div>
    );
  }

  const handleTemplateEdit = (template: COATemplate) => {
    setEditingTemplate(template);
    setIsFormOpen(true);
    setIsImportOpen(false);
    setSelectedTemplate(undefined);
  };

  const handleTemplateSubmit = (template: Omit<COATemplate, 'id'>) => {
    if (editingTemplate) {
      updateTemplate(editingTemplate.id, template);
    } else {
      addTemplate(template);
    }
    setIsFormOpen(false);
    setIsImportOpen(false);
    setEditingTemplate(undefined);
  };

  const handleTemplateCancel = () => {
    setIsFormOpen(false);
    setIsImportOpen(false);
    setEditingTemplate(undefined);
  };

  const handleTemplateSelect = (template: COATemplate) => {
    setSelectedTemplate(template);
    setIsFormOpen(false);
    setIsImportOpen(false);
  };

  const handleDatapointSubmit = (datapoint: Omit<Datapoint, 'id' | 'templateId' | 'sortOrder'>) => {
    if (selectedTemplate) {
      if (editingDatapoint) {
        updateDatapoint(selectedTemplate.id, editingDatapoint.id, datapoint);
      } else {
        addDatapoint(selectedTemplate.id, datapoint);
      }
    }
    setIsDatapointFormOpen(false);
    setEditingDatapoint(undefined);
  };

  const handleDatapointEdit = (datapoint: Datapoint) => {
    setEditingDatapoint(datapoint);
    setIsDatapointFormOpen(true);
  };

  const handleBack = () => {
    setSelectedTemplate(undefined);
    setIsDatapointFormOpen(false);
    setEditingDatapoint(undefined);
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {selectedTemplate ? (
          <>
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="text-gray-600 transition-colors hover:text-gray-900"
                type="button"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to templates</span>
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">
                {selectedTemplate.name} - Datapoints
              </h1>
            </div>
            {!isDatapointFormOpen && (
              <button
                onClick={() => setIsDatapointFormOpen(true)}
                className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                type="button"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Datapoint
              </button>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-gray-900">COA Templates</h1>
            {!isFormOpen && !isImportOpen && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsFormOpen(true)}
                  className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  type="button"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Template
                </button>
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="inline-flex items-center rounded-md border border-transparent bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  type="button"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Build From File
                </button>
              </div>
            )}
          </>
        )}
      </header>

      <section
        aria-label={selectedTemplate ? 'Template detail workspace' : 'Template library workspace'}
        className="space-y-4"
      >
        {selectedTemplate ? (
          isDatapointFormOpen ? (
            <div className="rounded-lg bg-white p-6 shadow">
              <DatapointForm
                template={selectedTemplate}
                initialData={editingDatapoint}
                onSubmit={handleDatapointSubmit}
                onCancel={() => {
                  setIsDatapointFormOpen(false);
                  setEditingDatapoint(undefined);
                }}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <DatapointList
                template={selectedTemplate}
                datapoints={datapoints[selectedTemplate.id] || []}
                onEdit={handleDatapointEdit}
                onDelete={(id) => deleteDatapoint(selectedTemplate.id, id)}
                onReorder={(ids) => reorderDatapoints(selectedTemplate.id, ids)}
              />
            </div>
          )
        ) : isFormOpen ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <TemplateForm
              initialData={editingTemplate}
              onSubmit={handleTemplateSubmit}
              onCancel={handleTemplateCancel}
            />
          </div>
        ) : isImportOpen ? (
          <div className="rounded-lg bg-white p-6 shadow">
            <TemplateImportForm onClose={() => setIsImportOpen(false)} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <TemplateList
              templates={templates}
              onEdit={handleTemplateEdit}
              onDelete={deleteTemplate}
              onSelect={handleTemplateSelect}
            />
          </div>
        )}
      </section>
    </div>
  );
}
