package demo

type Repository interface {
	FindById(id string) (*Order, error)
}
