package demo

type Order struct {
	ID    string
	Total float64
}

func (o *Order) IsEmpty() bool {
	return o.Total == 0
}
