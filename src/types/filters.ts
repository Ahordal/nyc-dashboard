export type Filters = {
  grades: string[];
  boroughs: string[];
};

export type SetFilters = React.Dispatch<React.SetStateAction<Filters>>;