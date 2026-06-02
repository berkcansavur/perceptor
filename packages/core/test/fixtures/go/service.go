package demo

type Service struct {
	repository Repository
	events     chan Order
}

func (s *Service) Process(id string) error {
	order, err := s.repository.FindById(id)
	if err != nil {
		return err
	}
	s.events <- *order
	return nil
}
